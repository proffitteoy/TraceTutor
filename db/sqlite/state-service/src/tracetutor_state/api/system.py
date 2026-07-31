from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, status

from tracetutor_state.api.dependencies import get_system_service
from tracetutor_state.schemas import (
    LocalEventCreate,
    RuntimeStateStatusUpdate,
    RuntimeStateUpsert,
    ToolCallCreate,
    WorkflowCreate,
    WorkflowUpdate,
)
from tracetutor_state.services import SystemService

router = APIRouter(prefix="/api/v1/system", tags=["system"])


@router.post("/workflows", status_code=status.HTTP_201_CREATED, operation_id="system_create_workflow_run")
def create_workflow(payload: WorkflowCreate, service: SystemService = Depends(get_system_service)) -> dict[str, Any]:
    return service.create_workflow(payload)


@router.patch("/workflows/{run_id}", operation_id="system_update_workflow_run")
def update_workflow(run_id: str, payload: WorkflowUpdate, service: SystemService = Depends(get_system_service)) -> dict[str, Any]:
    return service.update_workflow(run_id, payload)


@router.get("/workflows/{run_id}", operation_id="system_get_workflow_run")
def get_workflow(run_id: str, service: SystemService = Depends(get_system_service)) -> dict[str, Any]:
    return service.get_workflow(run_id)


@router.get("/users/{user_id}/workflows", operation_id="system_list_workflow_runs")
def list_workflows(
    user_id: str,
    session_id: str | None = Query(default=None),
    workflow_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    service: SystemService = Depends(get_system_service),
) -> list[dict[str, Any]]:
    return service.list_workflows(user_id, session_id=session_id, status=workflow_status, limit=limit)


@router.get("/users/{user_id}/current-workflow", operation_id="system_get_current_workflow")
def get_current_workflow(user_id: str, session_id: str | None = Query(default=None), service: SystemService = Depends(get_system_service)) -> dict[str, Any] | None:
    return service.get_current_workflow(user_id, session_id)


@router.post("/tool-calls", status_code=status.HTTP_201_CREATED, operation_id="system_write_tool_call")
def write_tool_call(payload: ToolCallCreate, service: SystemService = Depends(get_system_service)) -> dict[str, Any]:
    return service.write_tool_call(payload)


@router.get("/tool-calls/{tool_call_id}", operation_id="system_get_tool_call")
def get_tool_call(tool_call_id: str, service: SystemService = Depends(get_system_service)) -> dict[str, Any]:
    return service.get_tool_call(tool_call_id)


@router.get("/users/{user_id}/tool-calls", operation_id="system_list_tool_calls")
def list_tool_calls(
    user_id: str,
    workflow_run_id: str | None = Query(default=None),
    call_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    service: SystemService = Depends(get_system_service),
) -> list[dict[str, Any]]:
    return service.list_tool_calls(user_id, workflow_run_id=workflow_run_id, status=call_status, limit=limit)


@router.get("/users/{user_id}/last-tool-call", operation_id="system_get_last_tool_call")
def get_last_tool_call(user_id: str, service: SystemService = Depends(get_system_service)) -> dict[str, Any] | None:
    return service.get_last_tool_call(user_id)


@router.put("/runtime-state", operation_id="system_upsert_runtime_state")
def upsert_runtime_state(payload: RuntimeStateUpsert, service: SystemService = Depends(get_system_service)) -> dict[str, Any]:
    return service.upsert_runtime_state(payload)


@router.get("/users/{user_id}/runtime-state", operation_id="system_list_runtime_state")
def list_runtime_state(
    user_id: str,
    session_id: str | None = Query(default=None),
    agent_name: str | None = Query(default=None),
    runtime_status: str | None = Query(default="active", alias="status"),
    service: SystemService = Depends(get_system_service),
) -> list[dict[str, Any]]:
    return service.list_runtime_state(user_id, session_id=session_id, agent_name=agent_name, status=runtime_status)


@router.patch("/runtime-state/{runtime_id}", operation_id="system_update_runtime_state_status")
def update_runtime_state_status(runtime_id: str, payload: RuntimeStateStatusUpdate, service: SystemService = Depends(get_system_service)) -> dict[str, Any]:
    return service.update_runtime_status(runtime_id, payload)


@router.post("/events", status_code=status.HTTP_201_CREATED, operation_id="system_write_local_event")
def write_local_event(payload: LocalEventCreate, service: SystemService = Depends(get_system_service)) -> dict[str, Any]:
    return service.write_local_event(payload)
