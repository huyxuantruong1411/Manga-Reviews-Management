with current_bronze as (
    select
        p.panel_id,
        p.manga_id,
        p.chapter_id,
        p.page_number,
        p.language,
        p.scan_mode,
        p.pipeline_version,
        p.snapshot_date,
        b._document_ejson
    from {{ ref('slv_panel_current') }} p
    inner join {{ ref('brz_manga_panels') }} b
        on p.panel_id = b._source_id
        and p.snapshot_date = b._snapshot_date
        and p.batch_id = b._batch_id
        and p.ingested_at = b._ingested_at
),
exploded as (
    select
        cb.panel_id,
        cb.manga_id,
        cb.chapter_id,
        cb.page_number,
        cb.language,
        cb.scan_mode,
        cb.pipeline_version,
        cb.snapshot_date,
        nullif(trim(json_extract_string(v.vocab_obj, '$.term')), '') as term_surface,
        lower(nullif(trim(json_extract_string(v.vocab_obj, '$.lemma')), '')) as lemma,
        upper(coalesce(nullif(trim(json_extract_string(v.vocab_obj, '$.pos_tag')), ''), 'UNKNOWN')) as pos_tag,
        coalesce({{ ejson_int('v.vocab_obj', '$.frequency') }}, 1) as frequency
    from current_bronze cb,
    unnest(from_json(json_extract(cb._document_ejson, '$.vocabulary'), '["JSON"]')) as v(vocab_obj)
)
select
    panel_id,
    row_number() over (partition by panel_id order by lemma, term_surface, pos_tag) as vocab_seq,
    manga_id,
    chapter_id,
    page_number,
    language,
    scan_mode,
    pipeline_version,
    term_surface,
    lemma,
    pos_tag,
    frequency,
    snapshot_date
from exploded
where lemma is not null
