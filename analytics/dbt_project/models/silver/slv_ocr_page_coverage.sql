with latest_scan_pages as (
    select
        {{ ejson_str('_document_ejson', '$.chapter_id') }} as chapter_id,
        {{ ejson_int('_document_ejson', '$.page_number') }} as page_number,
        {{ ejson_str('_document_ejson', '$.manga_id') }} as manga_id,
        {{ ejson_str('_document_ejson', '$.page_hash') }} as page_hash,
        {{ ejson_int('_document_ejson', '$.pipeline_version') }} as pipeline_version,
        {{ ejson_ts('_document_ejson', '$.scanned_at') }} as scanned_at
    from {{ ref('brz_panel_scan_pages') }}
    qualify row_number() over (
        partition by {{ ejson_str('_document_ejson', '$.chapter_id') }}, {{ ejson_int('_document_ejson', '$.page_number') }}
        order by _snapshot_date desc, {{ ejson_ts('_document_ejson', '$.scanned_at') }} desc nulls last, _ingested_at desc
    ) = 1
),
panel_page_agg as (
    select
        chapter_id,
        page_number,
        count(*) as panel_count,
        count(*) filter (where has_cleaned_text) as panels_with_text_count,
        max(language) as scan_language,
        max(scan_mode) as scan_mode
    from {{ ref('slv_panel_current') }}
    group by chapter_id, page_number
),
token_page_agg as (
    select
        chapter_id,
        page_number,
        sum(frequency) as token_occurrence_count
    from {{ ref('slv_panel_token_occurrence') }}
    group by chapter_id, page_number
)
select
    pg.page_key,
    pg.chapter_id,
    pg.manga_id,
    pg.language as chapter_language,
    pg.page_number,
    pg.md5_hash as current_page_md5_hash,
    (sp.chapter_id is not null) as is_scanned,
    case
        when sp.chapter_id is null then false
        when sp.page_hash is not null and pg.md5_hash is not null and sp.page_hash = pg.md5_hash then true
        else false
    end as page_hash_matches,
    sp.pipeline_version,
    sp.scanned_at,
    coalesce(pa.scan_language, pg.language) as scan_language,
    pa.scan_mode,
    coalesce(pa.panel_count, 0) as panel_count,
    coalesce(pa.panels_with_text_count, 0) as panels_with_text_count,
    coalesce(ta.token_occurrence_count, 0) as token_occurrence_count,
    pg.snapshot_date
from {{ ref('slv_chapter_page') }} pg
left join latest_scan_pages sp
    on pg.chapter_id = sp.chapter_id
    and pg.page_number = sp.page_number
left join panel_page_agg pa
    on pg.chapter_id = pa.chapter_id
    and pg.page_number = pa.page_number
left join token_page_agg ta
    on pg.chapter_id = ta.chapter_id
    and pg.page_number = ta.page_number
