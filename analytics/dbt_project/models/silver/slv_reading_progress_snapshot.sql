with latest_prog as (
    select
        _source_id as progress_doc_id,
        {{ ejson_str('_document_ejson', '$.manga_id') }} as manga_id,
        {{ ejson_str('_document_ejson', '$.last_read_chapter_id') }} as last_read_chapter_id,
        {{ ejson_str('_document_ejson', '$.last_read_chapter_number') }} as last_read_chapter_number,
        {{ ejson_str('_document_ejson', '$.last_read_language') }} as last_read_language,
        {{ ejson_int('_document_ejson', '$.last_read_page') }} as last_read_page,
        coalesce(json_array_length(json_extract(_document_ejson, '$.read_chapter_ids')), 0) as read_chapter_count,
        {{ ejson_str('_document_ejson', '$.reading_mode') }} as reading_mode,
        {{ ejson_str('_document_ejson', '$.fit_mode') }} as fit_mode,
        {{ ejson_ts('_document_ejson', '$.updated_at') }} as updated_at,
        _snapshot_date as snapshot_date,
        _ingested_at as ingested_at,
        _batch_id as batch_id
    from {{ ref('brz_reading_progress') }}
    qualify row_number() over (
        partition by {{ ejson_str('_document_ejson', '$.manga_id') }}
        order by _snapshot_date desc, {{ ejson_ts('_document_ejson', '$.updated_at') }} desc nulls last, _ingested_at desc
    ) = 1
)
select
    p.*,
    true as is_snapshot_only,
    (m.manga_id is not null) as manga_exists
from latest_prog p
left join {{ ref('slv_manga_current') }} m
    on p.manga_id = m.manga_id
