{% macro ejson_str(doc_col, json_path) -%}
coalesce(
    nullif(json_extract_string({{ doc_col }}, '{{ json_path }}.$oid'), ''),
    nullif(json_extract_string({{ doc_col }}, '{{ json_path }}'), '')
)
{%- endmacro %}

{% macro ejson_int(doc_col, json_path) -%}
coalesce(
    try_cast(json_extract_string({{ doc_col }}, '{{ json_path }}.$numberInt') as bigint),
    try_cast(json_extract_string({{ doc_col }}, '{{ json_path }}.$numberLong') as bigint),
    try_cast(try_cast(json_extract_string({{ doc_col }}, '{{ json_path }}.$numberDouble') as double) as bigint),
    try_cast(json_extract_string({{ doc_col }}, '{{ json_path }}') as bigint)
)
{%- endmacro %}

{% macro ejson_double(doc_col, json_path) -%}
coalesce(
    try_cast(json_extract_string({{ doc_col }}, '{{ json_path }}.$numberDouble') as double),
    try_cast(json_extract_string({{ doc_col }}, '{{ json_path }}.$numberInt') as double),
    try_cast(json_extract_string({{ doc_col }}, '{{ json_path }}.$numberLong') as double),
    try_cast(json_extract_string({{ doc_col }}, '{{ json_path }}') as double)
)
{%- endmacro %}

{% macro ejson_bool(doc_col, json_path) -%}
try_cast(json_extract({{ doc_col }}, '{{ json_path }}') as boolean)
{%- endmacro %}

{% macro ejson_ts(doc_col, json_path) -%}
coalesce(
    to_timestamp(
        try_cast(json_extract_string({{ doc_col }}, '{{ json_path }}.$date.$numberLong') as double) / 1000.0
    ),
    try_cast(json_extract_string({{ doc_col }}, '{{ json_path }}.$date') as timestamptz),
    try_cast(json_extract_string({{ doc_col }}, '{{ json_path }}') as timestamptz)
)
{%- endmacro %}

{% macro silver_private_parquet(filename) -%}
    {%- set allowed = ['review_text_private.parquet', 'review_aspect_features.parquet', 'review_aspect_mentions.parquet'] -%}
    {%- if filename not in allowed -%}
        {{ exceptions.raise_compiler_error("Disallowed staging file: " ~ filename) }}
    {%- endif -%}
    {%- set root = var('silver_staging_root') | replace('\\', '/') -%}
    read_parquet('{{ root }}/{{ filename }}')
{%- endmacro %}
