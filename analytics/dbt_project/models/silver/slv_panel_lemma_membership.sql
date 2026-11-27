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
)
select distinct
    cb.panel_id,
    lower(trim(l.lemma_val)) as lemma,
    cb.manga_id,
    cb.chapter_id,
    cb.page_number,
    cb.language,
    cb.scan_mode,
    cb.pipeline_version,
    cb.snapshot_date
from current_bronze cb,
unnest(from_json(json_extract(cb._document_ejson, '$.lemmas'), '["VARCHAR"]')) as l(lemma_val)
where nullif(trim(l.lemma_val), '') is not null
