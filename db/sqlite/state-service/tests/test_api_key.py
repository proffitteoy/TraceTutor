import pytest
from fastapi.testclient import TestClient

from tracetutor_state.config import Settings
from tracetutor_state.main import create_app


def test_optional_service_token_guard(tmp_path, monkeypatch):
    monkeypatch.setenv("TRACE_TUTOR_SQLITE_SERVICE_TOKEN", "test-secret")
    app = create_app(db_path=tmp_path / "secured.db")
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.post("/api/v1/state/users", json={}).status_code == 401
        response = client.post(
            "/api/v1/state/users",
            headers={"Authorization": "Bearer test-secret"},
            json={"display_name": "secured"},
        )
        assert response.status_code == 201


def test_production_requires_long_service_token(tmp_path, monkeypatch):
    monkeypatch.setenv("TRACE_TUTOR_STATE_ENV", "production")
    monkeypatch.setenv("TRACE_TUTOR_SQLITE_SERVICE_TOKEN", "too-short")

    with pytest.raises(RuntimeError, match="at least 16 characters"):
        Settings.from_env(tmp_path / "production.db")
