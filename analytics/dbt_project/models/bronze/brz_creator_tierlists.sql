select
    _source_database,
    _source_collection,
    _source_id,
    _ingested_at,
    _snapshot_date,
    _batch_id,
    _document_hash,
    _document_ejson
from {{ bronze_parquet_relation('creator_tierlists') }}
