with baseline as (
    select
        avg(personal_rating) as global_mean,
        median(personal_rating) as global_median,
        count(*) as global_rated_count
    from {{ ref('slv_manga_current') }}
    where personal_rating is not null
),
dim_rows as (
    select
        'tag' as dimension_type,
        tb.tag_label as dimension_value,
        tb.tag_group as dimension_subtype,
        m.manga_id,
        m.read_status,
        m.personal_rating
    from {{ ref('slv_manga_tag_bridge') }} tb
    inner join {{ ref('slv_manga_current') }} m using (manga_id)

    union all

    select
        'publication_demographic' as dimension_type,
        coalesce(m.publication_demographic, 'unspecified') as dimension_value,
        'manga_attribute' as dimension_subtype,
        m.manga_id,
        m.read_status,
        m.personal_rating
    from {{ ref('slv_manga_current') }} m

    union all

    select
        'original_language' as dimension_type,
        coalesce(m.original_language, 'unknown') as dimension_value,
        'manga_attribute' as dimension_subtype,
        m.manga_id,
        m.read_status,
        m.personal_rating
    from {{ ref('slv_manga_current') }} m

    union all

    select
        'content_rating' as dimension_type,
        coalesce(m.content_rating, 'unknown') as dimension_value,
        'manga_attribute' as dimension_subtype,
        m.manga_id,
        m.read_status,
        m.personal_rating
    from {{ ref('slv_manga_current') }} m

    union all

    select
        'publication_status' as dimension_type,
        coalesce(m.publication_status, 'unknown') as dimension_value,
        'manga_attribute' as dimension_subtype,
        m.manga_id,
        m.read_status,
        m.personal_rating
    from {{ ref('slv_manga_current') }} m
),
cohorts as (
    select 'all_library' as cohort_scope, * from dim_rows
    union all
    select 'completed_only' as cohort_scope, * from dim_rows where read_status = 'completed'
),
agg as (
    select
        c.cohort_scope,
        c.dimension_type,
        c.dimension_value,
        max(c.dimension_subtype) as dimension_subtype,
        count(distinct c.manga_id) as total_manga_count,
        count(distinct c.manga_id) filter (where c.personal_rating is not null) as rated_manga_count,
        avg(c.personal_rating) as raw_mean_personal_rating,
        median(c.personal_rating) as raw_median_personal_rating,
        stddev_samp(c.personal_rating) as rating_stddev
    from cohorts c
    group by c.cohort_scope, c.dimension_type, c.dimension_value
)
select
    cast('{{ var("as_of_date") }}' as date) as as_of_date,
    '{{ var("release_id") }}' as release_id,
    '{{ var("metric_definition_version") }}' as metric_definition_version,
    a.cohort_scope || ':' || a.dimension_type || ':' || a.dimension_value as mart_row_key,
    a.cohort_scope,
    a.dimension_type,
    a.dimension_value,
    a.dimension_subtype,
    a.total_manga_count,
    a.rated_manga_count,
    case
        when a.total_manga_count > 0 then a.rated_manga_count::double / a.total_manga_count::double
        else null
    end as rating_coverage_rate,
    a.raw_mean_personal_rating,
    a.raw_median_personal_rating,
    a.rating_stddev,
    b.global_mean as global_baseline_mean,
    b.global_median as global_baseline_median,
    10 as shrinkage_prior_k,
    case
        when a.rated_manga_count > 0
            then (a.rated_manga_count::double * a.raw_mean_personal_rating + 10.0 * b.global_mean) / (a.rated_manga_count::double + 10.0)
        else null
    end as shrunk_mean_personal_rating,
    a.raw_mean_personal_rating - b.global_mean as raw_lift_vs_baseline,
    case
        when a.rated_manga_count > 0
            then ((a.rated_manga_count::double * a.raw_mean_personal_rating + 10.0 * b.global_mean) / (a.rated_manga_count::double + 10.0)) - b.global_mean
        else null
    end as shrunk_lift_vs_baseline,
    case
        when a.rated_manga_count >= 2 and a.rating_stddev is not null
            then a.raw_mean_personal_rating - 1.96 * (a.rating_stddev / sqrt(a.rated_manga_count::double))
        else null
    end as ci95_lower,
    case
        when a.rated_manga_count >= 2 and a.rating_stddev is not null
            then a.raw_mean_personal_rating + 1.96 * (a.rating_stddev / sqrt(a.rated_manga_count::double))
        else null
    end as ci95_upper,
    {{ reliability_from_n('a.rated_manga_count', 3, 10, 25) }} as reliability_status,
    case
        when a.rated_manga_count < 3 then 1
        when a.total_manga_count > 0 and (a.rated_manga_count::double / a.total_manga_count::double) < 0.15 then 1
        else 0
    end as quality_warning_count,
    'Observational association only; not causal.' as interpretation_caveat
from agg a
cross join baseline b
