from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class Settings:
    db_path: Path
    environment: str = "development"
    cors_origins: tuple[str, ...] = ()
    log_level: str = "INFO"
    service_token: str | None = None
    asset_validation_mode: str = "off"
    asset_validation_url: str | None = None
    asset_validation_token: str | None = None
    asset_validation_timeout_seconds: float = 3.0

    @classmethod
    def from_env(cls, db_path: str | Path | None = None) -> "Settings":
        raw_path = db_path or os.getenv(
            "TRACE_TUTOR_SQLITE_PATH", "data/tracetutor_state.db"
        )
        raw_origins = os.getenv("TRACE_TUTOR_STATE_CORS_ORIGINS", "")
        origins = tuple(item.strip() for item in raw_origins.split(",") if item.strip())
        settings = cls(
            db_path=Path(raw_path).expanduser().resolve(),
            environment=os.getenv("TRACE_TUTOR_STATE_ENV", "development"),
            cors_origins=origins,
            log_level=os.getenv("TRACE_TUTOR_STATE_LOG_LEVEL", "INFO").upper(),
            service_token=os.getenv("TRACE_TUTOR_SQLITE_SERVICE_TOKEN") or None,
            asset_validation_mode=os.getenv(
                "TRACE_TUTOR_ASSET_VALIDATION_MODE", "off"
            ).strip().lower(),
            asset_validation_url=os.getenv("TRACE_TUTOR_ASSET_VALIDATION_URL") or None,
            asset_validation_token=os.getenv("TRACE_TUTOR_ASSET_VALIDATION_TOKEN") or None,
            asset_validation_timeout_seconds=float(
                os.getenv("TRACE_TUTOR_ASSET_VALIDATION_TIMEOUT_SECONDS", "3.0")
            ),
        )
        if settings.environment == "production" and (
            settings.service_token is None or len(settings.service_token) < 16
        ):
            raise RuntimeError(
                "TRACE_TUTOR_SQLITE_SERVICE_TOKEN must contain at least "
                "16 characters in production"
            )
        return settings
