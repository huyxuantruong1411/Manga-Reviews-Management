with lib_stats as (
    select
        count(distinct manga_id) as eligible_manga_count,
        avg(personal_rating) filter (where personal_rating is not null) as global_rated_mean
    from {{ ref('slv_manga_current') }}
),
manga_tags as (
    select
        tb.manga_id,
        tb.tag_id,
        tb.tag_label,
        tb.tag_group,
        m.personal_rating
    from {{ ref('slv_manga_tag_bridge') }} tb
    inner join {{ ref('slv_manga_current') }} m using (manga_id)
),
tag_counts as (
    select
        tag_id,
        max(tag_label) as tag_label,
        max(tag_group) as tag_group,
        count(distinct manga_id) as tag_manga_count
    from manga_tags
    group by tag_id
),
pairs as (
    select
        a.tag_id as tag_id_a,
        b.tag_id as tag_id_b,
        count(distinct a.manga_id) as co_occurrence_count,
        count(distinct a.manga_id) filter (where a.personal_rating is not null) as rated_pair_count,
        avg(a.personal_rating) filter (where a.personal_rating is not null) as pair_raw_mean_rating,
        stddev_samp(a.personal_rating) filter (where a.personal_rating is not null) as pair_rating_stddev
    from manga_tags a
    inner join manga_tags b
        on a.manga_id = b.manga_id
        and a.tag_id < b.tag_id
    group by a.tag_id, b.tag_id
    having count(distinct a.manga_id) >= 5
),
scored as (
    select
        p.*,
        ta.tag_label as tag_label_a,
        ta.tag_group as tag_group_a,
        ta.tag_manga_count as tag_a_count,
        tb.tag_label as tag_label_b,
        tb.tag_group as tag_group_b,
        tb.tag_manga_count as tag_b_count,
        ls.eligible_manga_count,
        ls.global_rated_mean,
        p.co_occurrence_count::double / ls.eligible_manga_count::double as support,
        p.co_occurrence_count::double / ta.tag_manga_count::double as confidence_a_to_b,
        p.co_occurrence_count::double / tb.tag_manga_count::double as confidence_b_to_a,
        (p.co_occurrence_count::double / ls.eligible_manga_count::double)
            / ((ta.tag_manga_count::double / ls.eligible_manga_count::double) * (tb.tag_manga_count::double / ls.eligible_manga_count::double)) as lift,
        ln(
            ((p.co_occurrence_count::double + 0.5) * (ls.eligible_manga_count::double + 1.0))
            / ((ta.tag_manga_count::double + 0.5) * (tb.tag_manga_count::double + 0.5))
        ) as smoothed_pmi
    from pairs p
    inner join tag_counts ta on p.tag_id_a = ta.tag_id
    inner join tag_counts tb on p.tag_id_b = tb.tag_id
    cross join lib_stats ls
)
select
    cast('{{ var("as_of_date") }}' as date) as as_of_date,
    '{{ var("release_id") }}' as release_id,
    '{{ var("metric_definition_version") }}' as metric_definition_version,
    tag_id_a || '__' || tag_id_b as mart_row_key,
    tag_id_a,
    tag_label_a,
    tag_group_a,
    tag_id_b,
    tag_label_b,
    tag_group_b,
    eligible_manga_count,
    tag_a_count,
    tag_b_count,
    co_occurrence_count,
    support,
    confidence_a_to_b,
    confidence_b_to_a,
    lift,
    smoothed_pmi,
    rated_pair_count,
    pair_raw_mean_rating,
    global_rated_mean,
    10 as shrinkage_prior_k,
    case
        when rated_pair_count > 0
            then (rated_pair_count::double * pair_raw_mean_rating + 10.0 * global_rated_mean) / (rated_pair_count::double + 10.0)
        else null
    end as shrunk_pair_mean_rating,
    case
        when rated_pair_count > 0
            then ((rated_pair_count::double * pair_raw_mean_rating + 10.0 * global_rated_mean) / (rated_pair_count::double + 10.0)) - global_rated_mean
        else null
    end as shrunk_rating_lift,
    pair_rating_stddev,
    (co_occurrence_count >= 15) as min_support_met,
    true as is_exploratory_unadjusted,
    {{ reliability_from_n('rated_pair_count', 3, 10, 25) }} as reliability_status,
    case when co_occurrence_count < 15 or rated_pair_count < 5 then 1 else 0 end as quality_warning_count,
    'Exploratory co-occurrence and observational rating lift; not causal.' as interpretation_caveat
from scored
