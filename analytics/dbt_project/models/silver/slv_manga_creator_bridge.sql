with current_bronze as (
    select
        m.manga_id,
        m.snapshot_date,
        m.creator_ref_count_raw,
        b._document_ejson
    from {{ ref('slv_manga_current') }} m
    inner join {{ ref('brz_mangas') }} b
        on m.manga_id = b._source_id
        and m.snapshot_date = b._snapshot_date
        and m.batch_id = b._batch_id
        and m.ingested_at = b._ingested_at
),
embedded_refs as (
    select
        cb.manga_id,
        cb.snapshot_date,
        nullif(trim(json_extract_string(c.creator_obj, '$.creator_id')), '') as embedded_creator_id,
        nullif(trim(json_extract_string(c.creator_obj, '$.mangadex_id')), '') as embedded_mangadex_id,
        nullif(trim(json_extract_string(c.creator_obj, '$.name')), '') as embedded_name,
        nullif(trim(json_extract_string(c.creator_obj, '$.slug')), '') as embedded_slug,
        lower(trim(coalesce(nullif(json_extract_string(c.creator_obj, '$.role'), ''), 'author'))) as role
    from current_bronze cb,
    unnest(from_json(json_extract(cb._document_ejson, '$.creators'), '["JSON"]')) as c(creator_obj)
),
resolved_embedded as (
    select
        e.manga_id,
        coalesce(c_by_id.creator_id, c_by_dex.creator_id, e.embedded_creator_id, 'unresolved:' || md5(coalesce(e.embedded_name, ''))) as creator_id,
        e.role,
        coalesce(c_by_id.creator_name, c_by_dex.creator_name, e.embedded_name) as creator_name,
        coalesce(c_by_id.creator_slug, c_by_dex.creator_slug, e.embedded_slug) as creator_slug,
        coalesce(c_by_id.mangadex_id, c_by_dex.mangadex_id, e.embedded_mangadex_id) as mangadex_id,
        case
            when c_by_id.creator_id is not null then 'canonical_creator_id'
            when c_by_dex.creator_id is not null then 'mangadex_id'
            when e.embedded_creator_id is not null then 'embedded_canonical_id_unmatched'
            else 'embedded_name_only'
        end as identity_resolution_method,
        case
            when c_by_id.creator_id is not null or c_by_dex.creator_id is not null then 'high'
            when e.embedded_creator_id is not null then 'medium'
            else 'low'
        end as identity_confidence,
        e.snapshot_date
    from embedded_refs e
    left join {{ ref('slv_creator_current') }} c_by_id
        on e.embedded_creator_id = c_by_id.creator_id
    left join {{ ref('slv_creator_current') }} c_by_dex
        on e.embedded_creator_id is distinct from c_by_id.creator_id
        and e.embedded_mangadex_id is not null
        and e.embedded_mangadex_id = c_by_dex.mangadex_id
),
legacy_fallback as (
    select
        cb.manga_id,
        'legacy:author:' || md5(lower(trim({{ ejson_str('cb._document_ejson', '$.author') }}))) as creator_id,
        'author' as role,
        trim({{ ejson_str('cb._document_ejson', '$.author') }}) as creator_name,
        cast(null as varchar) as creator_slug,
        cast(null as varchar) as mangadex_id,
        'legacy_string_fallback' as identity_resolution_method,
        'low' as identity_confidence,
        cb.snapshot_date
    from current_bronze cb
    where cb.creator_ref_count_raw = 0
      and nullif(trim({{ ejson_str('cb._document_ejson', '$.author') }}), '') is not null
    union all
    select
        cb.manga_id,
        'legacy:artist:' || md5(lower(trim({{ ejson_str('cb._document_ejson', '$.artist') }}))) as creator_id,
        'artist' as role,
        trim({{ ejson_str('cb._document_ejson', '$.artist') }}) as creator_name,
        cast(null as varchar) as creator_slug,
        cast(null as varchar) as mangadex_id,
        'legacy_string_fallback' as identity_resolution_method,
        'low' as identity_confidence,
        cb.snapshot_date
    from current_bronze cb
    where cb.creator_ref_count_raw = 0
      and nullif(trim({{ ejson_str('cb._document_ejson', '$.artist') }}), '') is not null
),
combined as (
    select * from resolved_embedded
    union all
    select * from legacy_fallback
)
select
    manga_id,
    creator_id,
    role,
    creator_name,
    creator_slug,
    mangadex_id,
    identity_resolution_method,
    identity_confidence,
    snapshot_date
from combined
qualify row_number() over (
    partition by manga_id, creator_id, role
    order by
        case identity_confidence when 'high' then 1 when 'medium' then 2 else 3 end asc
) = 1
