PYTHON ?= python
VENV ?= .venv
PIP := $(VENV)/bin/pip
UVICORN := $(VENV)/bin/uvicorn
PYTEST := $(VENV)/bin/pytest

.PHONY: setup migrate run test verify demo openapi reset docker-up docker-down

setup:
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -e ".[dev]"

migrate:
	$(VENV)/bin/tracetutor-state migrate

run:
	$(UVICORN) tracetutor_state.main:app --app-dir src --host 0.0.0.0 --port 8000 --reload

test:
	$(PYTEST)

verify:
	$(VENV)/bin/python -m compileall -q src scripts tests
	$(PYTEST)
	$(VENV)/bin/python scripts/verify_release.py

demo:
	$(VENV)/bin/python scripts/demo_flow.py

openapi:
	$(VENV)/bin/python scripts/export_openapi.py
	$(VENV)/bin/python scripts/generate_api_catalog.py

reset:
	bash scripts/reset_local_db.sh

docker-up:
	docker compose up --build

docker-down:
	docker compose down
