with latest_boards as (
    select
        _source_id as tierlist_id,
        {{ ejson_str('_document_ejson', '$.creator_name') }} as creator_name,
        {{ ejson_str('_document_ejson', '$.creator_name_normalized') }} as creator_name_normalized,
        {{ ejson_str('_document_ejson', '$.title') }} as tierlist_title,
        {{ ejson_str('_document_ejson', '$.category_tag') }} as category_tag,
        coalesce({{ ejson_bool('_document_ejson', '$.is_default') }}, false) as is_default,
        coalesce({{ ejson_int('_document_ejson', '$.revision') }}, 1) as revision,
        {{ ejson_ts('_document_ejson', '$.created_at') }} as created_at,
        {{ ejson_ts('_document_ejson', '$.updated_at') }} as updated_at,
        _snapshot_date as snapshot_date,
        _document_ejson
    from {{ ref('brz_creator_tierlists') }}
    qualify row_number() over (
        partition by _source_id
        order by _snapshot_date desc, {{ ejson_ts('_document_ejson', '$.updated_at') }} desc nulls last, _ingested_at desc
    ) = 1
),
rows_exploded as (
    select
        b.tierlist_id,
        b.creator_name,
        b.creator_name_normalized,
        b.tierlist_title,
        b.category_tag,
        b.is_default,
        b.revision,
        b.created_at,
        b.updated_at,
        b.snapshot_date,
        row_number() over (partition by b.tierlist_id) - 1 as tier_row_index,
        json_extract_string(t.row_obj, '$.row_id') as tier_row_id,
        json_extract_string(t.row_obj, '$.label') as tier_label,
        json_extract_string(t.row_obj, '$.color_key') as tier_color_key,
        json_extract(t.row_obj, '$.items') as items_json
    from latest_boards b,
    unnest(from_json(json_extract(b._document_ejson, '$.tiers'), '["JSON"]')) as t(row_obj)
),
items_exploded as (
    select
        r.tierlist_id,
        r.creator_name,
        r.creator_name_normalized,
        r.tierlist_title,
        r.category_tag,
        r.is_default,
        r.revision,
        r.tier_row_index,
        r.tier_row_id,
        r.tier_label,
        r.tier_color_key,
        row_number() over (partition by r.tierlist_id, r.tier_row_index) - 1 as item_position_index,
        nullif(trim(json_extract_string(i.item_obj, '$.manga_id')), '') as manga_id,
        r.created_at,
        r.updated_at,
        r.snapshot_date
    from rows_exploded r,
    unnest(from_json(r.items_json, '["JSON"]')) as i(item_obj)
)
select
    ie.*,
    (m.manga_id is not null) as manga_exists,
    m.personal_rating as manga_personal_rating,
    m.read_status as manga_read_status
from items_exploded ie
left join {{ ref('slv_manga_current') }} m
    on ie.manga_id = m.manga_id
where ie.manga_id is not null
qualify row_number() over (
    partition by ie.tierlist_id, ie.manga_id
    order by ie.tier_row_index asc, ie.item_position_index asc
) = 1
