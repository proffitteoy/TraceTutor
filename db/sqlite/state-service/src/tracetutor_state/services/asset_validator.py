from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

from tracetutor_state.config import Settings
from tracetutor_state.errors import DomainValidationError


class AssetReferenceValidator(Protocol):
    def validate_question_id(self, question_id: str) -> None: ...

    def validate_tag_id(self, tag_type: str, tag_id: str) -> None: ...


@dataclass(frozen=True, slots=True)
class NoopAssetReferenceValidator:
    def validate_question_id(self, question_id: str) -> None:
        if not question_id.strip():
            raise DomainValidationError("question_id cannot be empty")

    def validate_tag_id(self, tag_type: str, tag_id: str) -> None:
        if not tag_id.strip():
            raise DomainValidationError(f"{tag_type} tag_id cannot be empty")


@dataclass(frozen=True, slots=True)
class UUIDFormatAssetReferenceValidator:
    """Validate the cross-database ID contract without contacting PgSQL."""

    def _validate_uuid(self, label: str, value: str) -> None:
        try:
            UUID(value)
        except (ValueError, AttributeError) as exc:
            raise DomainValidationError(
                f"{label} must be a UUID string under the PgSQL ID contract"
            ) from exc

    def validate_question_id(self, question_id: str) -> None:
        self._validate_uuid("question_id", question_id)

    def validate_tag_id(self, tag_type: str, tag_id: str) -> None:
        # question_type/structure/thinking_pattern may be local state tags and may
        # intentionally have no PgSQL ID. This function is only called when an ID
        # was provided.
        self._validate_uuid(f"{tag_type}.tag_id", tag_id)


@dataclass(frozen=True, slots=True)
class HttpAssetReferenceValidator:
    base_url: str
    token: str | None = None
    timeout_seconds: float = 3.0

    def _validate(self, reference_type: str, reference_id: str) -> None:
        payload = json.dumps(
            {"reference_type": reference_type, "reference_id": reference_id}
        ).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = Request(
            self.base_url.rstrip("/") + "/validate-reference",
            data=payload,
            headers=headers,
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise DomainValidationError(
                "PgSQL asset reference validation service is unavailable or returned an invalid response"
            ) from exc
        if not body.get("valid"):
            reason = body.get("reason") or "reference not found or inactive"
            raise DomainValidationError(
                f"Invalid {reference_type} reference {reference_id}: {reason}"
            )

    def validate_question_id(self, question_id: str) -> None:
        self._validate("question", question_id)

    def validate_tag_id(self, tag_type: str, tag_id: str) -> None:
        self._validate(tag_type, tag_id)


def build_asset_validator(settings: Settings) -> AssetReferenceValidator:
    if settings.asset_validation_mode == "off":
        return NoopAssetReferenceValidator()
    if settings.asset_validation_mode == "format":
        return UUIDFormatAssetReferenceValidator()
    if settings.asset_validation_mode == "http":
        if not settings.asset_validation_url:
            raise RuntimeError(
                "TRACE_TUTOR_ASSET_VALIDATION_URL is required when validation mode is http"
            )
        return HttpAssetReferenceValidator(
            base_url=settings.asset_validation_url,
            token=settings.asset_validation_token,
            timeout_seconds=settings.asset_validation_timeout_seconds,
        )
    raise RuntimeError(
        "TRACE_TUTOR_ASSET_VALIDATION_MODE must be one of: off, format, http"
    )
