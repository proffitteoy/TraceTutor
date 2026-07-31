from fastapi import Request

from tracetutor_state.services import StateService, SystemService
from tracetutor_state.services.config_service import ConfigService


def get_state_service(request: Request) -> StateService:
    return StateService(
        request.app.state.database,
        asset_validator=request.app.state.asset_validator,
    )


def get_system_service(request: Request) -> SystemService:
    return SystemService(request.app.state.database)


def get_config_service(request: Request) -> ConfigService:
    return ConfigService(request.app.state.database)
