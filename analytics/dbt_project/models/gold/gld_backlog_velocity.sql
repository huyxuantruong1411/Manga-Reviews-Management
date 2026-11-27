with windows as (
    select unnest([30, 90, 180]) as window_days
),
manga_events as (
    select
        manga_id,
        count(*) filter (where action = 'update_status') as status_transition_count,
        min(event_at) filter (where action = 'update_status' and to_status = 'completed') as first_audit_completed_at
    from {{ ref('slv_manga_status_events') }}
    where manga_exists
    group by manga_id
),
manga_lifecycle as (
    select
        m.manga_id,
        strftime(cast(m.added_at as date), '%Y-%m') as cohort_month,
        date_trunc('month', cast(m.added_at as date)) as cohort_month_start,
        cast(m.added_at as date) as added_date,
        m.read_status,
        coalesce(e.first_audit_completed_at, m.completed_at) as effective_completed_at,
        (e.status_transition_count > 0) as has_status_audit,
        coalesce(e.status_transition_count, 0) as status_transition_count,
        datediff('day', cast(m.added_at as date), cast('{{ var("as_of_date") }}' as date)) as days_since_added,
        case
            when coalesce(e.first_audit_completed_at, m.completed_at) is not null
                 and coalesce(e.first_audit_completed_at, m.completed_at) >= m.added_at
                then datediff('day', cast(m.added_at as date), cast(coalesce(e.first_audit_completed_at, m.completed_at) as date))
            else null
        end as completion_days
    from {{ ref('slv_manga_current') }} m
    left join manga_events e using (manga_id)
    where m.added_at is not null
),
cohort_window as (
    select
        ml.cohort_month,
        min(ml.cohort_month_start) as cohort_month_start,
        w.window_days,
        count(*) as cohort_acquisition_count,
        count(*) filter (where ml.days_since_added >= w.window_days) as mature_eligible_count,
        count(*) filter (
            where ml.days_since_added >= w.window_days
              and ml.completion_days is not null
              and ml.completion_days <= w.window_days
        ) as completed_within_window_count,
        count(*) filter (where ml.has_status_audit) as manga_with_audit_count,
        cast(sum(ml.status_transition_count) as bigint) as audit_transition_count,
        count(*) filter (where ml.read_status = 'unread') as current_unread_count,
        count(*) filter (where ml.read_status = 'plan_to_read') as current_plan_to_read_count,
        count(*) filter (where ml.read_status = 'on_hold') as current_on_hold_count,
        count(*) filter (where ml.read_status = 'dropped') as current_dropped_count,
        count(*) filter (where ml.read_status = 'completed') as current_completed_count,
        median(ml.days_since_added) filter (where ml.read_status = 'unread') as median_unread_backlog_age_days,
        quantile_cont(ml.days_since_added, 0.90) filter (where ml.read_status = 'unread') as p90_unread_backlog_age_days
    from manga_lifecycle ml
    cross join windows w
    group by ml.cohort_month, w.window_days
)
select
    cast('{{ var("as_of_date") }}' as date) as as_of_date,
    '{{ var("release_id") }}' as release_id,
    '{{ var("metric_definition_version") }}' as metric_definition_version,
    cohort_month || ':' || cast(window_days as varchar) || 'd' as mart_row_key,
    cohort_month,
    cohort_month_start,
    window_days as milestone_window_days,
    cohort_acquisition_count,
    mature_eligible_count,
    (mature_eligible_count = cohort_acquisition_count and mature_eligible_count > 0) as is_cohort_fully_matured,
    (mature_eligible_count >= 10) as is_cohort_matured,
    completed_within_window_count,
    case
        when mature_eligible_count >= 10
            then completed_within_window_count::double / mature_eligible_count::double
        else null
    end as cohort_completion_rate,
    case
        when mature_eligible_count >= 10
            then {{ wilson_lower('completed_within_window_count', 'mature_eligible_count') }}
        else null
    end as completion_ci95_lower,
    case
        when mature_eligible_count >= 10
            then {{ wilson_upper('completed_within_window_count', 'mature_eligible_count') }}
        else null
    end as completion_ci95_upper,
    manga_with_audit_count::double / cohort_acquisition_count::double as status_event_coverage_rate,
    audit_transition_count,
    current_unread_count,
    current_plan_to_read_count,
    current_on_hold_count,
    current_dropped_count,
    current_completed_count,
    median_unread_backlog_age_days,
    p90_unread_backlog_age_days,
    case
        when mature_eligible_count < 10 then 'insufficient_data'
        when (manga_with_audit_count::double / cohort_acquisition_count::double) < 0.25 then 'low'
        when mature_eligible_count < 30 then 'medium'
        else 'high'
    end as reliability_status,
    case
        when mature_eligible_count < 10 then 1
        when (manga_with_audit_count::double / cohort_acquisition_count::double) < 0.50 then 1
        else 0
    end as quality_warning_count,
    'Immature cohort completion cells are masked (NULL); unread is not treated as permanently abandoned.' as interpretation_caveat
from cohort_window
