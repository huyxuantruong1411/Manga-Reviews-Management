{% macro bronze_parquet_relation(entity_name) -%}
    {%- set allowed = [
        'mangas', 'reviews', 'tags', 'creators', 'chapters', 'chapter_slots',
        'reading_progress', 'audit_logs', 'external_reviews', 'manga_panels',
        'panel_scan_pages', 'creator_tierlists'
    ] -%}
    {%- if entity_name not in allowed -%}
        {{ exceptions.raise_compiler_error("Disallowed Bronze entity name: " ~ entity_name) }}
    {%- endif -%}
    {%- set root = var('bronze_root') | replace('\\', '/') -%}
    read_parquet('{{ root }}/{{ entity_name }}/dt=*/data.parquet', hive_partitioning=true)
{%- endmacro %}

{% macro bronze_manifest_glob() -%}
    {%- set root = var('bronze_root') | replace('\\', '/') -%}
    read_json(
        '{{ root }}/*/dt=*/manifest.json',
        format='auto',
        union_by_name=true,
        columns={
            'batch_id': 'VARCHAR',
            'entity': 'VARCHAR',
            'snapshot_date': 'DATE',
            'started_at': 'TIMESTAMP',
            'completed_at': 'TIMESTAMP',
            'status': 'VARCHAR',
            'database_alias': 'VARCHAR',
            'collection': 'VARCHAR',
            'document_count': 'BIGINT',
            'file_bytes': 'BIGINT',
            'sha256': 'VARCHAR',
            'schema_fingerprint': 'VARCHAR',
            'duration_seconds': 'DOUBLE',
            'data_classification': 'VARCHAR',
            'contains_sensitive_text': 'BOOLEAN',
            'extractor_version': 'VARCHAR'
        }
    )
{%- endmacro %}
