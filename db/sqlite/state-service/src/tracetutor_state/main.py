from __future__ import annotations

import logging
from hmac import compare_digest
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from tracetutor_state import __version__
from tracetutor_state.api.config import router as config_router
from tracetutor_state.api.state import router as state_router
from tracetutor_state.api.system import router as system_router
from tracetutor_state.api.tool_execution import router as tool_execution_router
from tracetutor_state.config import Settings
from tracetutor_state.db import Database
from tracetutor_state.errors import (
    ConflictError,
    DomainValidationError,
    NotFoundError,
    StateServiceError,
)
from tracetutor_state.migrations import MigrationRunner, default_migrations_dir
from tracetutor_state.services.asset_validator import build_asset_validator


def create_app(
    db_path: str | Path | None = None,
    migrations_dir: str | Path | None = None,
) -> FastAPI:
    load_dotenv()
    settings = Settings.from_env(db_path)
    database = Database(settings.db_path)
    runner = MigrationRunner(database, migrations_dir or default_migrations_dir())
    asset_validator = build_asset_validator(settings)

    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        newly_applied = runner.migrate()
        if newly_applied:
            logging.getLogger("tracetutor_state").info(
                "Applied migrations: %s", newly_applied
            )
        app.state.database = database
        app.state.migration_runner = runner
        app.state.settings = settings
        app.state.asset_validator = asset_validator
        yield

    app = FastAPI(
        title="TraceTutor SQLite Learning State Service",
        version=__version__,
        description=(
            "User learning facts, mastery state, review scheduling, Agent memory, "
            "workflow logs, and evidence-gated state write-back."
        ),
        lifespan=lifespan,
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    if settings.service_token:
        public_paths = {
            "/",
            "/health",
            "/health/live",
            "/health/ready",
            "/docs",
            "/openapi.json",
            "/redoc",
        }

        @app.middleware("http")
        async def service_token_guard(request: Request, call_next):
            if request.url.path not in public_paths:
                authorization = request.headers.get("Authorization", "")
                supplied = (
                    authorization.removeprefix("Bearer ")
                    if authorization.startswith("Bearer ")
                    else ""
                )
                if not supplied or not compare_digest(
                    supplied, settings.service_token
                ):
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Missing or invalid service token"},
                    )
            return await call_next(request)

    @app.exception_handler(NotFoundError)
    async def not_found_handler(
        _request: Request, exc: NotFoundError
    ) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(ConflictError)
    async def conflict_handler(
        _request: Request, exc: ConflictError
    ) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(DomainValidationError)
    async def validation_handler(
        _request: Request, exc: DomainValidationError
    ) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(StateServiceError)
    async def domain_handler(
        _request: Request, exc: StateServiceError
    ) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.get("/", tags=["meta"], operation_id="service_root")
    def root() -> dict[str, Any]:
        return {
            "service": "tracetutor-sqlite-state-service",
            "version": __version__,
            "docs": "/docs",
            "openapi": "/openapi.json",
        }

    @app.get("/health", tags=["meta"], operation_id="service_health")
    def health(request: Request) -> dict[str, Any]:
        current_runner: MigrationRunner = request.app.state.migration_runner
        return {
            "status": "ok",
            "database_path": str(request.app.state.database.path),
            "schema_version": current_runner.current_version(),
            "foreign_key_violations": current_runner.foreign_key_violations(),
        }

    @app.get("/health/live", tags=["meta"], operation_id="service_health_live")
    def health_live() -> dict[str, str]:
        return {"status": "ok", "service": "tracetutor-sqlite-state-service"}

    @app.get("/health/ready", tags=["meta"], operation_id="service_health_ready")
    def health_ready(request: Request) -> JSONResponse:
        current_runner: MigrationRunner = request.app.state.migration_runner
        expected_version = 6
        version = current_runner.current_version()
        violations = current_runner.foreign_key_violations()
        ready = version == expected_version and not violations
        return JSONResponse(
            status_code=200 if ready else 503,
            content={
                "status": "ready" if ready else "degraded",
                "schema_version": version,
                "expected_schema_version": expected_version,
                "foreign_key_violations": violations,
            },
        )

    app.include_router(state_router)
    app.include_router(system_router)
    app.include_router(config_router)
    app.include_router(tool_execution_router)
    return app


app = create_app()
