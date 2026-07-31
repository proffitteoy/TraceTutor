from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Response, status

from tracetutor_state.api.dependencies import get_config_service
from tracetutor_state.schemas import ConfigUpsert
from tracetutor_state.services.config_service import ConfigService

router = APIRouter(prefix="/api/v1/config", tags=["config"])


@router.put("/values", operation_id="config_upsert_value")
def upsert_config(payload: ConfigUpsert, service: ConfigService = Depends(get_config_service)) -> dict[str, Any]:
    return service.upsert(payload)


@router.get("/values/{key}", operation_id="config_get_value")
def get_config(
    key: str,
    scope: str = Query(default="global"),
    owner_id: str | None = Query(default=None),
    service: ConfigService = Depends(get_config_service),
) -> dict[str, Any]:
    return service.get(key, scope, owner_id)


@router.get("/values", operation_id="config_list_values")
def list_config(
    scope: str | None = Query(default=None),
    owner_id: str | None = Query(default=None),
    service: ConfigService = Depends(get_config_service),
) -> list[dict[str, Any]]:
    return service.list(scope, owner_id)


@router.delete("/values/{key}", status_code=status.HTTP_204_NO_CONTENT, operation_id="config_delete_value")
def delete_config(
    key: str,
    scope: str = Query(default="global"),
    owner_id: str | None = Query(default=None),
    service: ConfigService = Depends(get_config_service),
) -> Response:
    service.delete(key, scope, owner_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/effective", operation_id="config_get_effective_bundle")
def effective_config(
    user_id: str | None = Query(default=None),
    session_id: str | None = Query(default=None),
    service: ConfigService = Depends(get_config_service),
) -> dict[str, Any]:
    return service.effective_bundle(user_id, session_id)
