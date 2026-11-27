with mal_agg as (
    select
        m.manga_id,
        m.manga_title_raw as manga_title,
        'myanimelist_aggregate' as provider_source,
        'provider_aggregate' as score_kind,
        m.personal_rating,
        m.read_status,
        m.tracker_mal_score as external_score_raw,
        '0-10' as external_score_scale,
        m.tracker_mal_score as external_score_normalized_10,
        m.tracker_mal_scored_by as external_sample_count,
        cast(null as double) as external_score_median_10,
        cast(null as double) as recommendation_share,
        cast(null as double) as preliminary_share,
        cast(null as double) as spoiler_share,
        coalesce(m.tracker_mal_last_synced_at, m.tracker_fetched_at) as last_synced_at,
        false as is_convenience_sample
    from {{ ref('slv_manga_current') }} m
    where m.tracker_mal_score is not null
),
anilist_agg as (
    select
        m.manga_id,
        m.manga_title_raw as manga_title,
        'anilist_aggregate' as provider_source,
        'provider_aggregate' as score_kind,
        m.personal_rating,
        m.read_status,
        m.tracker_anilist_mean_score::double as external_score_raw,
        '0-100' as external_score_scale,
        m.tracker_anilist_mean_score::double / 10.0 as external_score_normalized_10,
        cast(null as bigint) as external_sample_count,
        cast(null as double) as external_score_median_10,
        cast(null as double) as recommendation_share,
        cast(null as double) as preliminary_share,
        cast(null as double) as spoiler_share,
        m.tracker_fetched_at as last_synced_at,
        false as is_convenience_sample
    from {{ ref('slv_manga_current') }} m
    where m.tracker_anilist_mean_score is not null
),
ext_reviews_agg as (
    select
        er.manga_id,
        max(m.manga_title_raw) as manga_title,
        er.source || '_reviews' as provider_source,
        'individual_crawled_reviews' as score_kind,
        max(m.personal_rating) as personal_rating,
        max(m.read_status) as read_status,
        avg(er.overall_rating) filter (where er.overall_rating is not null) as external_score_raw,
        '1-10' as external_score_scale,
        avg(er.overall_rating) filter (where er.overall_rating is not null) as external_score_normalized_10,
        count(*) filter (where er.overall_rating is not null) as external_sample_count,
        median(er.overall_rating) filter (where er.overall_rating is not null) as external_score_median_10,
        case
            when count(*) filter (where er.recommendation_status in ('recommended', 'mixed_feelings', 'not_recommended')) > 0
                then count(*) filter (where er.recommendation_status = 'recommended')::double
                    / (count(*) filter (where er.recommendation_status in ('recommended', 'mixed_feelings', 'not_recommended')))::double
            else null
        end as recommendation_share,
        avg(case when er.is_preliminary then 1.0 else 0.0 end) as preliminary_share,
        avg(case when er.is_spoiler then 1.0 else 0.0 end) as spoiler_share,
        max(er.fetched_at) as last_synced_at,
        true as is_convenience_sample
    from {{ ref('slv_external_review_current') }} er
    inner join {{ ref('slv_manga_current') }} m using (manga_id)
    group by er.manga_id, er.source
),
unioned as (
    select * from mal_agg
    union all
    select * from anilist_agg
    union all
    select * from ext_reviews_agg
)
select
    cast('{{ var("as_of_date") }}' as date) as as_of_date,
    '{{ var("release_id") }}' as release_id,
    '{{ var("metric_definition_version") }}' as metric_definition_version,
    manga_id || ':' || provider_source as mart_row_key,
    manga_id,
    manga_title,
    provider_source,
    score_kind,
    personal_rating,
    read_status,
    external_score_raw,
    external_score_scale,
    external_score_normalized_10,
    external_score_median_10,
    case
        when personal_rating is not null and external_score_normalized_10 is not null
            then personal_rating - external_score_normalized_10
        else null
    end as personal_external_gap,
    case
        when personal_rating is not null and external_score_normalized_10 is not null
            then abs(personal_rating - external_score_normalized_10)
        else null
    end as abs_gap,
    external_sample_count,
    recommendation_share,
    preliminary_share,
    spoiler_share,
    last_synced_at,
    datediff('day', cast(last_synced_at as date), cast('{{ var("as_of_date") }}' as date)) as freshness_days,
    is_convenience_sample,
    case
        when personal_rating is null then 'insufficient_data'
        when is_convenience_sample and coalesce(external_sample_count, 0) < 5 then 'low'
        when is_convenience_sample and coalesce(external_sample_count, 0) < 15 then 'medium'
        when not is_convenience_sample and coalesce(external_sample_count, 100) >= 50 then 'high'
        else 'medium'
    end as reliability_status,
    case
        when personal_rating is null or (is_convenience_sample and coalesce(external_sample_count, 0) < 5) then 1
        else 0
    end as quality_warning_count,
    'Aggregate tracker scores and crawled individual reviews are kept strictly separate; crawled reviews are a non-random convenience sample.' as interpretation_caveat
from unioned
