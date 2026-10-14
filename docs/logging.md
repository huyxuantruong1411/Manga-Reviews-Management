# Logging & Observability Architecture

This document describes the structured logging, secret redaction, and ELK (Elasticsearch, Logstash, Kibana, Filebeat) observability integration in the Manga Reviews & Learning Platform.

---

## 1. Architectural Overview

The logging pipeline captures and correlates events across HTTP endpoints and background asynchronous workers while safeguarding sensitive tokens and presigned storage links:

```
FastAPI & Workers (API, OCR, Translation)
       │
       ▼
 [LogRedactionFilter] (MinIO presigned URLs, Google AI keys, Bearer tokens)
       │
       ▼
 [Rotating NDJSON File] (logs/manga-{service}.ndjson, ECS-compliant)
       │
       ▼
 [Filebeat] (infra/elk/filebeat/filebeat.yml)
       │
       ▼
 [Logstash Pipeline] (infra/elk/logstash/pipeline/manga-logs.conf)
       │
       ▼
 [Elasticsearch] (manga-logs-*, manga-audit-*)
       │
       ▼
 [Kibana Dashboard] (Embedded Anonymous Viewer & Native Observability UI)
```

---

## 2. Core Components

### A. ECS Structured Logging & Request Correlation
- **Module**: [`backend/core/logging_config.py`](../backend/core/logging_config.py)
- **Format**: Elastic Common Schema (ECS) via `ecs-logging`.
- **Trace Correlation**: Every HTTP request receives or forwards an `X-Request-ID` header, propagated to logger records as `trace.id` through ContextVar in [`backend/core/log_context.py`](../backend/core/log_context.py). Background tasks receive a corresponding `task_id` / `job_id`.
- **Service Identity**: Declared per service runner (`api`, `worker_ocr`, `worker_translation`, `smoke`).

### B. Two-Layer Secret Redaction
- **Module**: [`backend/core/log_redaction.py`](../backend/core/log_redaction.py)
- **Filter**: Automatically applied to all logging handlers.
- **Redacted Targets**:
  - MinIO Presigned URLs: Strips signature query params (`X-Amz-Signature`, `X-Amz-Credential`) while preserving the bucket and object path.
  - Google Gemini API Keys: Replaces `AIzaSy[A-Za-z0-9_-]{33}` with `[REDACTED_API_KEY]`.
  - Authorization Headers: Sanitizes `Bearer <token>` strings.

### C. Standalone ELK Docker Infrastructure
- **Directory**: [`infra/elk/`](../infra/elk/)
- **Composition**:
  - `elasticsearch`: Single-node cluster with ILM policy retaining logs for 30 days.
  - `logstash`: Processes NDJSON streams, parses trace context, and routes to appropriate indices.
  - `kibana`: Configured with iframe embedding allowed (`security.embeddedContent.csp`) and anonymous viewer access.
  - `filebeat`: Harvests local NDJSON files from the host `logs/` directory.

### D. Dual-Write & Graceful Fallback Strategy
- **Audit Logs**:
  - Primary store: MongoDB (`audit_logs` collection) remains the durable source of truth.
  - Search engine: Elasticsearch (`manga-audit-*`) provides instant full-text search and aggregations.
  - Fallback: If Elasticsearch is stopped or unreachable, the system automatically routes queries to MongoDB without errors.
- **Application Logs**:
  - Search engine: Elasticsearch (`manga-logs-*`) queried via [`backend/routers/system_logs.py`](../backend/routers/system_logs.py).
  - Fallback: If Elasticsearch is offline, the backend parses local NDJSON files (`logs/manga-*.ndjson`) in reverse chronological order.

---

## 3. Observability UI (`/audit-logs`)

The frontend Observability Center provides three sub-tabs:

1. **Audit Logs (Nghiệp Vụ)**: Business audit trail tracking manga edits, chapter additions, ratings, and status transitions with engine indicator (`Elasticsearch Search` vs `MongoDB Storage`).
2. **Application Logs (ECS Bản Địa)**: Native log table with level KPIs, service filters, free-text search, trace correlation, and stack trace inspection drawer.
3. **Kibana Observability**: Embedded Kibana dashboard iframe (`manga-observability-overview`) with Discover mode switcher, or an aesthetic offline setup guide when Docker containers are not running.

---

## 4. Lifecycle & Maintenance Scripts

| Script | Purpose | Command |
|---|---|---|
| `scripts/elk/bootstrap_env.py` | Generate `.env` and configure ELK directories | `python scripts/elk/bootstrap_env.py` |
| `scripts/elk/smoke_logs.py` | Generate synthetic sample logs for verification | `python scripts/elk/smoke_logs.py --count 10` |
| `scripts/elk/prune_logs.py` | Clean up old local NDJSON log files | `python scripts/elk/prune_logs.py --days 14` |
| `scripts/elk/backfill_audit.py` | Sync historical MongoDB audit logs into Elasticsearch | `python scripts/elk/backfill_audit.py` |

---

## 5. Quick Start (Running ELK Locally)

1. Initialize environment:
   ```bash
   python scripts/elk/bootstrap_env.py
   ```
2. Start containers:
   ```bash
   docker compose -f infra/elk/docker-compose.elk.yml --env-file infra/elk/.env up -d
   ```
3. Run smoke test logs:
   ```bash
   python scripts/elk/smoke_logs.py --count 20
   ```
4. Access Kibana at `http://localhost:5601` or through the platform UI at `/audit-logs?tab=kibana`.
