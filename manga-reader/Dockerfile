# syntax=docker/dockerfile:1
# Multi-stage Dockerfile for Standalone Manga Reader System v2.0

FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

RUN pip install --no-cache-dir uv

COPY pyproject.toml ./
RUN uv venv /opt/venv && \
    uv pip install --python /opt/venv/bin/python --no-cache .

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

RUN groupadd --gid 10001 mangareader && \
    useradd --uid 10001 --gid mangareader --shell /bin/bash --create-home mangareader

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY contracts ./contracts
COPY scripts ./scripts

RUN chown -R mangareader:mangareader /app

USER mangareader

EXPOSE 18000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:18000/health/live')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "18000"]

