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
latest_panels as (
    select
        _source_id as panel_id,
        {{ ejson_str('_document_ejson', '$.manga_id') }} as manga_id,
        {{ ejson_str('_document_ejson', '$.chapter_id') }} as chapter_id,
        {{ ejson_str('_document_ejson', '$.chapter_number') }} as chapter_number,
        {{ ejson_int('_document_ejson', '$.page_number') }} as page_number,
        {{ ejson_int('_document_ejson', '$.panel_index') }} as panel_index,
        lower(trim(coalesce({{ ejson_str('_document_ejson', '$.language') }}, 'unknown'))) as language,
        lower(trim(coalesce({{ ejson_str('_document_ejson', '$.scan_mode') }}, 'panel'))) as scan_mode,
        {{ ejson_int('_document_ejson', '$.pipeline_version') }} as panel_pipeline_version,
        {{ ejson_str('_document_ejson', '$.scan_generation') }} as scan_generation,
        (length(trim(coalesce({{ ejson_str('_document_ejson', '$.cleaned_text') }}, ''))) > 0) as has_cleaned_text,
        length(trim(coalesce({{ ejson_str('_document_ejson', '$.cleaned_text') }}, ''))) as cleaned_char_count,
        coalesce(json_array_length(json_extract(_document_ejson, '$.lemmas')), 0) as lemma_count,
        coalesce(json_array_length(json_extract(_document_ejson, '$.vocabulary')), 0) as vocab_item_count,
        {{ ejson_ts('_document_ejson', '$.created_at') }} as created_at,
        _snapshot_date as snapshot_date,
        _ingested_at as ingested_at,
        _batch_id as batch_id,
        _document_hash as document_hash
    from {{ ref('brz_manga_panels') }}
    qualify row_number() over (
        partition by _source_id
        order by _snapshot_date desc, _ingested_at desc
    ) = 1
)
select
    p.panel_id,
    p.manga_id,
    (m.manga_id is not null) as manga_exists,
    p.chapter_id,
    p.chapter_number,
    p.page_number,
    p.panel_index,
    p.language,
    p.scan_mode,
    coalesce(p.panel_pipeline_version, sp.pipeline_version, 2) as pipeline_version,
    p.scan_generation,
    sp.page_hash as scanned_page_hash,
    sp.scanned_at,
    p.has_cleaned_text,
    p.cleaned_char_count,
    p.lemma_count,
    p.vocab_item_count,
    p.created_at,
    p.snapshot_date,
    p.ingested_at,
    p.batch_id,
    p.document_hash
from latest_panels p
left join latest_scan_pages sp
    on p.chapter_id = sp.chapter_id
    and p.page_number = sp.page_number
left join {{ ref('slv_manga_current') }} m
    on p.manga_id = m.manga_id
