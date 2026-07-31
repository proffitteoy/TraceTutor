FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TRACE_TUTOR_SQLITE_PATH=/app/data/tracetutor_state.db

WORKDIR /app

COPY pyproject.toml README.md /app/
COPY src /app/src
RUN pip install --no-cache-dir .

RUN mkdir -p /app/data
EXPOSE 8000

CMD ["uvicorn", "tracetutor_state.main:app", "--app-dir", "src", "--host", "0.0.0.0", "--port", "8000"]
