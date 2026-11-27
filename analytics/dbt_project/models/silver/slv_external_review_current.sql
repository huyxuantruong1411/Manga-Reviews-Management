with latest_ext as (
    select
        _source_id as external_review_doc_id,
        {{ ejson_str('_document_ejson', '$.manga_id') }} as manga_id,
        lower(trim({{ ejson_str('_document_ejson', '$.source') }})) as source,
        {{ ejson_str('_document_ejson', '$.source_work_id') }} as source_work_id,
        {{ ejson_str('_document_ejson', '$.source_review_id') }} as source_review_id,
        {{ ejson_double('_document_ejson', '$.overall_rating') }} as overall_rating,
        lower(trim(coalesce({{ ejson_str('_document_ejson', '$.recommendation_status') }}, 'unknown'))) as recommendation_status,
        coalesce({{ ejson_bool('_document_ejson', '$.is_preliminary') }}, false) as is_preliminary,
        coalesce({{ ejson_bool('_document_ejson', '$.is_spoiler') }}, false) as is_spoiler,
        {{ ejson_int('_document_ejson', '$.word_count') }} as word_count,
        {{ ejson_int('_document_ejson', '$.character_count') }} as character_count,
        coalesce({{ ejson_int('_document_ejson', '$.reactions.total') }}, 0) as reactions_total,
        {{ ejson_ts('_document_ejson', '$.posted_at') }} as posted_at,
        {{ ejson_ts('_document_ejson', '$.fetched_at') }} as fetched_at,
        {{ ejson_ts('_document_ejson', '$.updated_at') }} as updated_at,
        _snapshot_date as snapshot_date,
        _ingested_at as ingested_at,
        _batch_id as batch_id,
        _document_hash as document_hash
    from {{ ref('brz_external_reviews') }}
    qualify row_number() over (
        partition by
            lower(trim({{ ejson_str('_document_ejson', '$.source') }})),
            {{ ejson_str('_document_ejson', '$.source_work_id') }},
            {{ ejson_str('_document_ejson', '$.source_review_id') }}
        order by _snapshot_date desc, {{ ejson_ts('_document_ejson', '$.fetched_at') }} desc nulls last, _ingested_at desc
    ) = 1
)
select
    e.*,
    (m.manga_id is not null) as manga_exists,
    (
        e.overall_rating is null
        or (e.overall_rating >= 1.0 and e.overall_rating <= 10.0)
    ) as rating_is_valid
from latest_ext e
left join {{ ref('slv_manga_current') }} m
    on e.manga_id = m.manga_id
