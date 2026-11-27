with base as (
    select
        manga_id,
        declared_chapters,
        declared_volumes,
        coalesce(publication_demographic, 'unspecified') as demographic,
        case
            when publication_status = 'completed' then 'completed_publication'
            when publication_status in ('ongoing', 'hiatus') then 'ongoing_or_hiatus'
            when publication_status = 'cancelled' then 'cancelled'
            else 'other_or_unknown'
        end as publication_status_cohort,
        case
            when declared_chapters is null then 'missing_metadata'
            when declared_chapters <= 15 then '01_1_to_15_short'
            when declared_chapters <= 50 then '02_16_to_50_medium'
            when declared_chapters <= 150 then '03_51_to_150_long'
            else '04_151_plus_epic'
        end as length_bucket,
        case
            when declared_chapters is null then 0
            when declared_chapters <= 15 then 1
            when declared_chapters <= 50 then 2
            when declared_chapters <= 150 then 3
            else 4
        end as length_bucket_order,
        read_status,
        case
            when completed_at is not null and added_at is not null and completed_at >= added_at
                then datediff('day', cast(added_at as date), cast(completed_at as date))
            else null
        end as acquisition_to_completion_days
    from {{ ref('slv_manga_current') }}
),
stratified as (
    select 'all' as demographic_scope, * from base
    union all
    select demographic as demographic_scope, * from base
),
agg as (
    select
        length_bucket,
        length_bucket_order,
        publication_status_cohort,
        demographic_scope,
        count(*) as eligible_manga_count,
        count(*) filter (where read_status = 'completed') as completed_count,
        count(*) filter (where read_status in ('reading', 're_reading')) as reading_count,
        count(*) filter (where read_status = 'plan_to_read') as plan_to_read_count,
        count(*) filter (where read_status = 'unread') as unread_count,
        count(*) filter (where read_status = 'on_hold') as on_hold_count,
        count(*) filter (where read_status = 'dropped') as dropped_count,
        count(*) filter (where acquisition_to_completion_days is not null) as valid_completion_latency_n,
        median(acquisition_to_completion_days) as median_acquisition_to_completion_days,
        avg(declared_chapters) as avg_declared_chapters
    from stratified
    group by length_bucket, length_bucket_order, publication_status_cohort, demographic_scope
)
select
    cast('{{ var("as_of_date") }}' as date) as as_of_date,
    '{{ var("release_id") }}' as release_id,
    '{{ var("metric_definition_version") }}' as metric_definition_version,
    length_bucket || ':' || publication_status_cohort || ':' || demographic_scope as mart_row_key,
    length_bucket,
    length_bucket_order,
    publication_status_cohort,
    demographic_scope,
    eligible_manga_count,
    completed_count,
    reading_count,
    plan_to_read_count,
    unread_count,
    on_hold_count,
    dropped_count,
    completed_count::double / eligible_manga_count::double as observed_completion_share,
    {{ wilson_lower('completed_count', 'eligible_manga_count') }} as completion_ci95_lower,
    {{ wilson_upper('completed_count', 'eligible_manga_count') }} as completion_ci95_upper,
    (on_hold_count + dropped_count)::double / eligible_manga_count::double as drop_or_hold_share,
    (unread_count + plan_to_read_count + reading_count)::double / eligible_manga_count::double as right_censored_active_share,
    valid_completion_latency_n,
    median_acquisition_to_completion_days,
    avg_declared_chapters,
    true as is_metadata_chapter_count,
    {{ reliability_from_n('eligible_manga_count', 5, 15, 40) }} as reliability_status,
    case when length_bucket = 'missing_metadata' or publication_status_cohort = 'ongoing_or_hiatus' then 1 else 0 end as quality_warning_count,
    'Collection-level association using external metadata chapter count; unread/reading works are right-censored.' as interpretation_caveat
from agg
