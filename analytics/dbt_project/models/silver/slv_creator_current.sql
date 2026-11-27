with ranked as (
    select
        _source_id as creator_doc_id,
        coalesce(
            nullif({{ ejson_str('_document_ejson', '$.creator_id') }}, ''),
            nullif({{ ejson_str('_document_ejson', '$.mangadex_id') }}, ''),
            _source_id
        ) as creator_id,
        {{ ejson_str('_document_ejson', '$.mangadex_id') }} as mangadex_id,
        {{ ejson_str('_document_ejson', '$.name') }} as creator_name,
        lower(trim(coalesce({{ ejson_str('_document_ejson', '$.name') }}, ''))) as creator_name_normalized,
        {{ ejson_str('_document_ejson', '$.slug') }} as creator_slug,
        {{ ejson_ts('_document_ejson', '$.created_at') }} as created_at,
        {{ ejson_ts('_document_ejson', '$.updated_at') }} as updated_at,
        _snapshot_date as snapshot_date,
        _ingested_at as ingested_at,
        _batch_id as batch_id,
        _document_hash as document_hash
    from {{ ref('brz_creators') }}
    qualify row_number() over (
        partition by _source_id
        order by _snapshot_date desc, {{ ejson_ts('_document_ejson', '$.updated_at') }} desc nulls last, _ingested_at desc
    ) = 1
)
select
    creator_id,
    creator_doc_id,
    mangadex_id,
    (mangadex_id is not null) as has_mangadex_id,
    creator_name,
    creator_name_normalized,
    creator_slug,
    created_at,
    updated_at,
    snapshot_date,
    ingested_at,
    batch_id,
    document_hash
from ranked
qualify row_number() over (
    partition by creator_id
    order by snapshot_date desc, updated_at desc nulls last, ingested_at desc
) = 1
