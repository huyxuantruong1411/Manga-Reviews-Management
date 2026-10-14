#!/bin/sh
set -e

ES_URL="http://elasticsearch:9200"

echo "==> [setup-es] Waiting for Elasticsearch to become ready..."
until curl -s -u "elastic:${ELASTIC_PASSWORD}" "${ES_URL}/_cluster/health" > /dev/null; do
  echo "Elasticsearch is unavailable - sleeping 3s..."
  sleep 3
done
echo "==> [setup-es] Elasticsearch is UP!"

# 1. Set password for kibana_system
echo "==> [setup-es] Setting kibana_system password..."
curl -s -X POST -u "elastic:${ELASTIC_PASSWORD}" \
  -H "Content-Type: application/json" \
  "${ES_URL}/_security/user/kibana_system/_password" \
  -d "{\"password\":\"${KIBANA_PASSWORD}\"}"

# 2. Create ILM policy manga-logs-policy
echo "==> [setup-es] Putting ILM policy manga-logs-policy..."
curl -s -X PUT -u "elastic:${ELASTIC_PASSWORD}" \
  -H "Content-Type: application/json" \
  "${ES_URL}/_ilm/policy/manga-logs-policy" \
  -d @/elasticsearch/ilm-manga-logs.json

# 3. Create Index Template manga-logs
echo "==> [setup-es] Putting index template manga-logs..."
curl -s -X PUT -u "elastic:${ELASTIC_PASSWORD}" \
  -H "Content-Type: application/json" \
  "${ES_URL}/_index_template/manga-logs" \
  -d @/elasticsearch/index-template-logs.json

# 4. Create Index Template manga-audit and initialize index with alias
echo "==> [setup-es] Putting index template manga-audit..."
curl -s -X PUT -u "elastic:${ELASTIC_PASSWORD}" \
  -H "Content-Type: application/json" \
  "${ES_URL}/_index_template/manga-audit" \
  -d @/elasticsearch/index-template-audit.json

echo "==> [setup-es] Initializing manga-audit-v1 index with alias manga-audit..."
curl -s -X PUT -u "elastic:${ELASTIC_PASSWORD}" \
  -H "Content-Type: application/json" \
  "${ES_URL}/manga-audit-v1" \
  -d '{"aliases": {"manga-audit": {}}}' || true

# 5. Create role and user for logstash_writer
echo "==> [setup-es] Creating role logstash_writer_role..."
curl -s -X PUT -u "elastic:${ELASTIC_PASSWORD}" \
  -H "Content-Type: application/json" \
  "${ES_URL}/_security/role/logstash_writer_role" \
  -d '{
    "cluster": ["monitor", "manage_index_templates"],
    "indices": [
      {
        "names": ["logs-mangalib.*-*"],
        "privileges": ["create_doc", "create_index", "auto_configure", "write"]
      }
    ]
  }'

echo "==> [setup-es] Creating user logstash_writer..."
curl -s -X POST -u "elastic:${ELASTIC_PASSWORD}" \
  -H "Content-Type: application/json" \
  "${ES_URL}/_security/user/logstash_writer" \
  -d "{
    \"password\": \"${LOGSTASH_WRITER_PASSWORD}\",
    \"roles\": [\"logstash_writer_role\"],
    \"full_name\": \"Logstash Shipping User\"
  }"

# 6. Create role and user for manga_app
echo "==> [setup-es] Creating role manga_app_role..."
curl -s -X PUT -u "elastic:${ELASTIC_PASSWORD}" \
  -H "Content-Type: application/json" \
  "${ES_URL}/_security/role/manga_app_role" \
  -d '{
    "cluster": ["monitor"],
    "indices": [
      {
        "names": ["manga-audit*"],
        "privileges": ["all"]
      },
      {
        "names": ["logs-mangalib.*-*"],
        "privileges": ["read", "view_index_metadata"]
      }
    ]
  }'

echo "==> [setup-es] Creating user manga_app..."
curl -s -X POST -u "elastic:${ELASTIC_PASSWORD}" \
  -H "Content-Type: application/json" \
  "${ES_URL}/_security/user/manga_app" \
  -d "{
    \"password\": \"${APP_ES_PASSWORD}\",
    \"roles\": [\"manga_app_role\"],
    \"full_name\": \"Manga FastAPI Backend Service\"
  }"

# 7. Create role and user for anonymous Kibana viewer
echo "==> [setup-es] Creating role manga_kibana_viewer_role..."
curl -s -X PUT -u "elastic:${ELASTIC_PASSWORD}" \
  -H "Content-Type: application/json" \
  "${ES_URL}/_security/role/manga_kibana_viewer_role" \
  -d '{
    "cluster": ["monitor"],
    "indices": [
      {
        "names": ["logs-mangalib.*-*", "manga-audit*"],
        "privileges": ["read", "view_index_metadata"]
      }
    ],
    "applications": [
      {
        "application": "kibana-.kibana",
        "privileges": ["read"],
        "resources": ["*"]
      }
    ]
  }'

echo "==> [setup-es] Creating user kibana_anonymous_viewer..."
curl -s -X POST -u "elastic:${ELASTIC_PASSWORD}" \
  -H "Content-Type: application/json" \
  "${ES_URL}/_security/user/kibana_anonymous_viewer" \
  -d "{
    \"password\": \"${KIBANA_VIEWER_PASSWORD}\",
    \"roles\": [\"manga_kibana_viewer_role\"],
    \"full_name\": \"Anonymous Read-Only Kibana Viewer\"
  }"

echo "==> [setup-es] All Elasticsearch provisioning completed successfully!"
