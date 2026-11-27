with baseline as (
    select
        avg(personal_rating) as global_mean
    from {{ ref('slv_manga_current') }}
    where personal_rating is not null
),
creator_works as (
    select
        b.creator_id,
        b.role,
        max(b.creator_name) as creator_name,
        max(b.identity_confidence) as best_identity_confidence,
        max(b.identity_resolution_method) as identity_resolution_method,
        count(distinct b.manga_id) as distinct_manga_count,
        count(distinct b.manga_id) filter (where m.personal_rating is not null) as rated_work_count,
        avg(m.personal_rating) filter (where m.personal_rating is not null) as raw_mean_rating,
        median(m.personal_rating) filter (where m.personal_rating is not null) as median_rating,
        stddev_samp(m.personal_rating) filter (where m.personal_rating is not null) as rating_stddev,
        quantile_cont(m.personal_rating, 0.75) filter (where m.personal_rating is not null)
            - quantile_cont(m.personal_rating, 0.25) filter (where m.personal_rating is not null) as rating_iqr,
        count(distinct b.manga_id) filter (where m.personal_rating >= 8.0) as high_rated_count,
        count(distinct b.manga_id) filter (where m.personal_rating <= 5.0) as low_rated_count
    from {{ ref('slv_manga_creator_bridge') }} b
    inner join {{ ref('slv_manga_current') }} m using (manga_id)
    group by b.creator_id, b.role
)
select
    cast('{{ var("as_of_date") }}' as date) as as_of_date,
    '{{ var("release_id") }}' as release_id,
    '{{ var("metric_definition_version") }}' as metric_definition_version,
    cw.creator_id || ':' || cw.role as mart_row_key,
    cw.creator_id,
    cw.creator_name,
    cw.role,
    cw.best_identity_confidence as identity_confidence,
    cw.identity_resolution_method,
    (cw.best_identity_confidence = 'high' and cw.rated_work_count >= 3) as is_ranked_eligible,
    cw.distinct_manga_count,
    cw.rated_work_count,
    cw.rated_work_count::double / cw.distinct_manga_count::double as rating_coverage_rate,
    cw.raw_mean_rating,
    cw.median_rating,
    cw.rating_stddev,
    cw.rating_iqr,
    b.global_mean as global_baseline_mean,
    5 as shrinkage_prior_k,
    case
        when cw.rated_work_count > 0
            then (cw.rated_work_count::double * cw.raw_mean_rating + 5.0 * b.global_mean) / (cw.rated_work_count::double + 5.0)
        else null
    end as shrunk_mean_rating,
    case
        when cw.rated_work_count >= 2 and cw.rating_stddev is not null
            then cw.raw_mean_rating - 1.96 * (cw.rating_stddev / sqrt(cw.rated_work_count::double))
        else null
    end as ci95_lower,
    case
        when cw.rated_work_count >= 2 and cw.rating_stddev is not null
            then cw.raw_mean_rating + 1.96 * (cw.rating_stddev / sqrt(cw.rated_work_count::double))
        else null
    end as ci95_upper,
    case when cw.rated_work_count > 0 then cw.high_rated_count::double / cw.rated_work_count::double else null end as high_rated_share,
    case when cw.rated_work_count > 0 then cw.low_rated_count::double / cw.rated_work_count::double else null end as low_rated_share,
    case
        when cw.best_identity_confidence <> 'high' then 'low'
        else {{ reliability_from_n('cw.rated_work_count', 3, 5, 10) }}
    end as reliability_status,
    case when cw.best_identity_confidence <> 'high' or cw.rated_work_count < 3 then 1 else 0 end as quality_warning_count
from creator_works cw
cross join baseline b
where cw.distinct_manga_count >= 2 or cw.rated_work_count >= 1
