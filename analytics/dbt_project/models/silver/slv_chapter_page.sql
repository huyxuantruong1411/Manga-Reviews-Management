with current_bronze as (
    select
        c.chapter_id,
        c.manga_id,
        c.logical_chapter_id,
        c.language,
        c.source,
        c.chapter_state,
        c.snapshot_date,
        b._document_ejson
    from {{ ref('slv_chapter_release') }} c
    inner join {{ ref('brz_chapters') }} b
        on c.chapter_id = b._source_id
        and c.snapshot_date = b._snapshot_date
        and c.batch_id = b._batch_id
        and c.ingested_at = b._ingested_at
),
pages_exploded as (
    select
        cb.chapter_id,
        cb.manga_id,
        cb.logical_chapter_id,
        cb.language,
        cb.source,
        cb.chapter_state,
        cb.snapshot_date,
        nullif(trim(json_extract_string(p.page_obj, '$.page_uid')), '') as page_uid,
        {{ ejson_int('p.page_obj', '$.page_number') }} as page_number,
        {{ ejson_str('p.page_obj', '$.md5_hash') }} as md5_hash,
        {{ ejson_int('p.page_obj', '$.file_size') }} as file_size,
        {{ ejson_int('p.page_obj', '$.width') }} as width,
        {{ ejson_int('p.page_obj', '$.height') }} as height
    from current_bronze cb,
    unnest(from_json(json_extract(cb._document_ejson, '$.pages'), '["JSON"]')) as p(page_obj)
)
select
    coalesce(page_uid, chapter_id || ':' || cast(page_number as varchar)) as page_key,
    case
        when page_uid is not null then 'page_uid'
        else 'composite_fallback'
    end as page_identity_method,
    page_uid,
    chapter_id,
    manga_id,
    logical_chapter_id,
    language,
    source,
    chapter_state,
    page_number,
    md5_hash,
    file_size,
    width,
    height,
    snapshot_date
from pages_exploded
qualify row_number() over (
    partition by coalesce(page_uid, chapter_id || ':' || cast(page_number as varchar))
    order by page_number asc
) = 1
