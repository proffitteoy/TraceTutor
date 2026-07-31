from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from tracetutor_state.services.tool_execution_service import ToolExecutionService
from tracetutor_state.tool_contracts import ToolExecutionRequest

router = APIRouter(prefix="/internal", tags=["tool-execution"])


@router.post(
    "/tool-execution",
    operation_id="tool_execution_execute",
)
def execute_tool(
    payload: ToolExecutionRequest, request: Request
) -> dict[str, Any]:
    service = ToolExecutionService(
        request.app.state.database,
        request.app.state.asset_validator,
    )
    return service.execute(payload.tool, payload.input, payload.context)
