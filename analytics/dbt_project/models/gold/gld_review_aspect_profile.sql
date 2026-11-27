with aspect_catalog as (
    select unnest([
        'art', 'character', 'plot', 'pacing', 'worldbuilding',
        'theme', 'dialogue', 'ending', 'emotion', 'adaptation'
    ]) as aspect
),
reviews_base as (
    select
        r.review_id,
        r.manga_id,
        r.is_finalized,
        r.manga_personal_rating,
        p.word_count,
        p.language_profile,
        p.taxonomy_version,
        p.classifier_method,
        case
            when r.manga_personal_rating is null then 'unrated'
            when r.manga_personal_rating >= 9.0 then '01_9.0_to_10.0'
            when r.manga_personal_rating >= 7.5 then '02_7.5_to_8.5'
            when r.manga_personal_rating >= 5.0 then '03_5.0_to_7.0'
            else '04_below_5.0'
        end as rating_band
    from {{ ref('slv_review_current') }} r
    inner join {{ ref('slv_review_text_private') }} p using (review_id)
),
cohorts as (
    select 'all_active' as review_cohort, * from reviews_base
    union all
    select 'finalized_only' as review_cohort, * from reviews_base where is_finalized
),
band_totals as (
    select
        review_cohort,
        rating_band,
        count(distinct review_id) as active_review_count,
        count(distinct manga_id) as distinct_manga_count,
        avg(word_count) as band_avg_word_count,
        max(taxonomy_version) as taxonomy_version,
        max(classifier_method) as classifier_method
    from cohorts
    group by review_cohort, rating_band
),
mention_agg as (
    select
        c.review_cohort,
        c.rating_band,
        m.aspect,
        count(distinct m.review_id) as aspect_review_count,
        count(*) as aspect_evidence_count,
        avg(c.word_count) as avg_words_in_mentioning_reviews,
        avg(c.manga_personal_rating) filter (where c.manga_personal_rating is not null) as avg_associated_manga_rating
    from cohorts c
    inner join {{ ref('slv_review_aspect_mentions') }} m
        on c.review_id = m.review_id
    group by c.review_cohort, c.rating_band, m.aspect
)
select
    cast('{{ var("as_of_date") }}' as date) as as_of_date,
    '{{ var("release_id") }}' as release_id,
    '{{ var("metric_definition_version") }}' as metric_definition_version,
    bt.review_cohort || ':' || bt.rating_band || ':' || ac.aspect as mart_row_key,
    ac.aspect,
    bt.rating_band,
    bt.review_cohort,
    bt.active_review_count,
    bt.distinct_manga_count,
    coalesce(ma.aspect_review_count, 0) as aspect_review_count,
    coalesce(ma.aspect_review_count, 0)::double / bt.active_review_count::double as aspect_mention_rate,
    {{ wilson_lower('coalesce(ma.aspect_review_count, 0)', 'bt.active_review_count') }} as mention_ci95_lower,
    {{ wilson_upper('coalesce(ma.aspect_review_count, 0)', 'bt.active_review_count') }} as mention_ci95_upper,
    coalesce(ma.aspect_evidence_count, 0) as aspect_evidence_count,
    bt.band_avg_word_count,
    ma.avg_words_in_mentioning_reviews,
    ma.avg_associated_manga_rating,
    bt.taxonomy_version,
    bt.classifier_method,
    false as sentiment_enabled,
    {{ reliability_from_n('bt.active_review_count', 5, 15, 40) }} as reliability_status,
    case when bt.active_review_count < 15 then 1 else 0 end as quality_warning_count,
    'Observable aspect mention frequency only; sentiment disabled pending annotated evaluation; no psychological claims.' as interpretation_caveat
from band_totals bt
cross join aspect_catalog ac
left join mention_agg ma
    on bt.review_cohort = ma.review_cohort
    and bt.rating_band = ma.rating_band
    and ac.aspect = ma.aspect
