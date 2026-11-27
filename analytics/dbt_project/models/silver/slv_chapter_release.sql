with latest_chapters as (
    select
        _source_id as chapter_id,
        {{ ejson_str('_document_ejson', '$.manga_id') }} as manga_id,
        {{ ejson_str('_document_ejson', '$.logical_chapter_id') }} as logical_chapter_id,
        {{ ejson_str('_document_ejson', '$.chapter_number') }} as chapter_number,
        {{ ejson_double('_document_ejson', '$.chapter_numeric') }} as chapter_numeric,
        {{ ejson_str('_document_ejson', '$.volume') }} as volume,
        lower(trim(coalesce({{ ejson_str('_document_ejson', '$.source') }}, 'unknown'))) as source,
        {{ ejson_str('_document_ejson', '$.source_id') }} as source_id,
        {{ ejson_str('_document_ejson', '$.source_work_id') }} as source_work_id,
        lower(trim(coalesce({{ ejson_str('_document_ejson', '$.language') }}, 'unknown'))) as language,
        {{ ejson_str('_document_ejson', '$.scanlation_group') }} as scanlation_group,
        lower(trim(coalesce({{ ejson_str('_document_ejson', '$.state') }}, 'ready'))) as chapter_state,
        coalesce({{ ejson_int('_document_ejson', '$.page_count') }}, 0) as page_count,
        coalesce({{ ejson_int('_document_ejson', '$.pages_revision') }}, 1) as pages_revision,
        {{ ejson_ts('_document_ejson', '$.created_at') }} as created_at,
        {{ ejson_ts('_document_ejson', '$.updated_at') }} as updated_at,
        _snapshot_date as snapshot_date,
        _ingested_at as ingested_at,
        _batch_id as batch_id,
        _document_hash as document_hash
    from {{ ref('brz_chapters') }}
    qualify row_number() over (
        partition by _source_id
        order by _snapshot_date desc, {{ ejson_ts('_document_ejson', '$.updated_at') }} desc nulls last, _ingested_at desc
    ) = 1
)
select
    c.*,
    (m.manga_id is not null) as manga_exists
from latest_chapters c
left join {{ ref('slv_manga_current') }} m
    on c.manga_id = m.manga_id
