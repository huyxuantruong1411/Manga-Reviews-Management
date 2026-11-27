with latest_reviews as (
    select
        _source_id as review_id,
        {{ ejson_str('_document_ejson', '$.manga_id') }} as manga_id,
        coalesce({{ ejson_bool('_document_ejson', '$.is_deleted') }}, false) as is_deleted,
        length(coalesce({{ ejson_str('_document_ejson', '$.title') }}, '')) as title_char_count,
        {{ ejson_ts('_document_ejson', '$.created_at') }} as created_at,
        {{ ejson_ts('_document_ejson', '$.updated_at') }} as updated_at,
        {{ ejson_ts('_document_ejson', '$.finalized_at') }} as finalized_at,
        _snapshot_date as snapshot_date,
        _ingested_at as ingested_at,
        _batch_id as batch_id,
        _document_hash as document_hash
    from {{ ref('brz_reviews') }}
    qualify row_number() over (
        partition by _source_id
        order by _snapshot_date desc, {{ ejson_ts('_document_ejson', '$.updated_at') }} desc nulls last, _ingested_at desc
    ) = 1
)
select
    r.review_id,
    r.manga_id,
    (m.manga_id is not null) as manga_exists,
    m.personal_rating as manga_personal_rating,
    m.read_status as manga_read_status,
    r.title_char_count,
    r.created_at,
    r.updated_at,
    r.finalized_at,
    (r.finalized_at is not null) as is_finalized,
    datediff('day', cast(r.created_at as date), cast('{{ var("as_of_date") }}' as date)) as review_age_days,
    r.snapshot_date,
    r.ingested_at,
    r.batch_id,
    r.document_hash
from latest_reviews r
left join {{ ref('slv_manga_current') }} m
    on r.manga_id = m.manga_id
where not r.is_deleted
