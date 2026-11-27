select
    batch_id,
    entity,
    snapshot_date,
    started_at,
    completed_at,
    status,
    database_alias,
    collection,
    document_count,
    file_bytes,
    sha256,
    schema_fingerprint,
    duration_seconds,
    data_classification,
    contains_sensitive_text,
    extractor_version
from {{ bronze_manifest_glob() }}
