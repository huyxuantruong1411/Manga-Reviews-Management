with current_bronze as (
    select
        m.manga_id,
        m.snapshot_date,
        b._document_ejson
    from {{ ref('slv_manga_current') }} m
    inner join {{ ref('brz_mangas') }} b
        on m.manga_id = b._source_id
        and m.snapshot_date = b._snapshot_date
        and m.batch_id = b._batch_id
        and m.ingested_at = b._ingested_at
),
unnested as (
    select distinct
        cb.manga_id,
        trim(t.tag_id) as tag_id,
        cb.snapshot_date
    from current_bronze cb,
    unnest(from_json(json_extract(cb._document_ejson, '$.tag_ids'), '["VARCHAR"]')) as t(tag_id)
    where trim(t.tag_id) <> ''
)
select
    u.manga_id,
    u.tag_id,
    u.snapshot_date,
    case
        when d.tag_id is not null then 'resolved'
        else 'missing_dimension'
    end as tag_resolution_status,
    coalesce(d.tag_label, u.tag_id) as tag_label,
    d.tag_name_en,
    d.tag_name_vi,
    coalesce(d.tag_group, 'unknown') as tag_group,
    coalesce(d.tag_source, 'unknown') as tag_source
from unnested u
left join {{ ref('slv_tag_current') }} d
    on u.tag_id = d.tag_id
