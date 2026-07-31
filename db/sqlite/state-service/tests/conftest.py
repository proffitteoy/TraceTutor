from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tracetutor_state.main import create_app


@pytest.fixture()
def client(tmp_path: Path):
    app = create_app(db_path=tmp_path / "test.db")
    with TestClient(app) as test_client:
        yield test_client
