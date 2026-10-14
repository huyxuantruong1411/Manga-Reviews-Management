#!/bin/sh
set -e

KIBANA_URL="http://kibana:5601"

echo "==> [setup-kibana] Waiting for Kibana to become ready..."
until curl -s -u "elastic:${ELASTIC_PASSWORD}" "${KIBANA_URL}/api/status" | grep -q '"overall":{"level":"available"'; do
  echo "Kibana is starting up - sleeping 5s..."
  sleep 5
done
echo "==> [setup-kibana] Kibana is UP and Available!"

# 1. Create Data Views
echo "==> [setup-kibana] Creating Data View manga-logs..."
curl -s -X POST -u "elastic:${ELASTIC_PASSWORD}" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  "${KIBANA_URL}/api/data_views/data_view" \
  -d '{
    "data_view": {
      "id": "manga-logs",
      "title": "logs-mangalib.*-*",
      "name": "manga-logs",
      "timeFieldName": "@timestamp"
    }
  }' || true

echo "==> [setup-kibana] Creating Data View manga-audit..."
curl -s -X POST -u "elastic:${ELASTIC_PASSWORD}" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  "${KIBANA_URL}/api/data_views/data_view" \
  -d '{
    "data_view": {
      "id": "manga-audit",
      "title": "manga-audit*",
      "name": "manga-audit",
      "timeFieldName": "timestamp"
    }
  }' || true

# 2. Create Saved Searches
echo "==> [setup-kibana] Creating saved searches..."
create_search() {
  id="$1"
  title="$2"
  query="$3"
  curl -s -X POST -u "elastic:${ELASTIC_PASSWORD}" \
    -H "kbn-xsrf: true" \
    -H "Content-Type: application/json" \
    "${KIBANA_URL}/api/saved_objects/search/${id}?overwrite=true" \
    -d "{
      \"attributes\": {
        \"title\": \"${title}\",
        \"description\": \"Pre-configured filter for ${title}\",
        \"kibanaSavedObjectMeta\": {
          \"searchSourceJSON\": \"{\\\"query\\\":{\\\"query\\\":\\\"${query}\\\",\\\"language\\\":\\\"kuery\\\"},\\\"filter\\\":[]}\"
        }
      }
    }" || true
}

create_search "manga-errors-critical" "Errors & Critical" "log.level: (error or critical)"
create_search "manga-http-5xx" "HTTP 5xx Responses" "http.response.status_code >= 500"
create_search "manga-slow-requests" "Slow Requests > 2s" "event.duration > 2000000000"
create_search "manga-translation-stages" "Translation Pipeline" "manga.stage: *"

# 3. Import Dashboards
echo "==> [setup-kibana] Importing Dashboard manga-system-overview..."
if [ -f /kibana/manga-dashboards.ndjson ]; then
  curl -s -X POST -u "elastic:${ELASTIC_PASSWORD}" \
    -H "kbn-xsrf: true" \
    --form file=@/kibana/manga-dashboards.ndjson \
    "${KIBANA_URL}/api/saved_objects/_import?overwrite=true"
fi

echo "==> [setup-kibana] Kibana provisioning completed successfully!"
