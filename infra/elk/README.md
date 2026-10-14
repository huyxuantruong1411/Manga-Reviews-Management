# Manga Library ELK Observability Stack

This directory contains the Docker Compose infrastructure for running the Elastic Stack (Elasticsearch, Logstash, Kibana, Filebeat) locally.

## Architecture

- **Elasticsearch 8.17.0**: Single-node cluster storing `logs-mangalib.*-*` (Data Streams) and `manga-audit` index. Bound strictly to `127.0.0.1:9200`.
- **Logstash 8.17.0**: Persistent queue processing pipeline receiving structured beats from Filebeat, performing Layer 2 redaction, and writing to Elasticsearch.
- **Filebeat 8.17.0**: Reads append-only `logs/*.ndjson` files emitted by FastAPI and ARQ workers via polling filestream.
- **Kibana 8.17.0**: Web dashboard and discover interface on `127.0.0.1:5601`. Configured with CSP `frame-ancestors` and Anonymous Read-Only Viewer for seamless iframe embedding in the React UI (`http://localhost:5173/audit-logs?tab=kibana`).

## Quickstart

### 1. Bootstrap Environment & Credentials
Run the bootstrap script to generate `infra/elk/.env` with secure random credentials and create the local `logs/` directory:
```bash
python scripts/elk/bootstrap_env.py
```

### 2. Start the Stack
```bash
docker compose -f infra/elk/docker-compose.elk.yml --env-file infra/elk/.env up -d
```

### 3. Check Service Status
```bash
docker compose -f infra/elk/docker-compose.elk.yml ps
```

### 4. Stop the Stack
```bash
docker compose -f infra/elk/docker-compose.elk.yml down
```

To remove all index data and start fresh:
```bash
docker compose -f infra/elk/docker-compose.elk.yml down -v
```
