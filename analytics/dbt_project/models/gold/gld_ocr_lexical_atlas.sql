with page_scope as (
    select
        manga_id,
        coalesce(scan_language, chapter_language) as language,
        coalesce(scan_mode, 'unscanned') as scan_mode,
        coalesce(pipeline_version, 0) as pipeline_version,
        count(*) as page_count,
        count(*) filter (where is_scanned and page_hash_matches) as current_scanned_pages,
        count(*) filter (where is_scanned and not page_hash_matches) as stale_scanned_pages,
        cast(sum(panel_count) as bigint) as panel_count,
        cast(sum(panels_with_text_count) as bigint) as panels_with_text_count
    from {{ ref('slv_ocr_page_coverage') }}
    where is_scanned
    group by 1, 2, 3, 4
),
manga_eligible_pages as (
    select
        manga_id,
        count(*) as eligible_downloaded_pages
    from {{ ref('slv_chapter_page') }}
    group by manga_id
),
token_agg as (
    select
        manga_id,
        language,
        scan_mode,
        pipeline_version,
        cast(sum(frequency) as bigint) as token_occurrence_count,
        cast(sum(frequency) filter (where pos_tag = 'NOUN') as bigint) as noun_tokens,
        cast(sum(frequency) filter (where pos_tag = 'VERB') as bigint) as verb_tokens,
        cast(sum(frequency) filter (where pos_tag = 'ADJ') as bigint) as adj_tokens,
        cast(sum(frequency) filter (where pos_tag in ('UNKNOWN', 'X')) as bigint) as unknown_pos_tokens
    from {{ ref('slv_panel_token_occurrence') }}
    group by 1, 2, 3, 4
),
lemma_agg as (
    select
        manga_id,
        language,
        scan_mode,
        pipeline_version,
        count(distinct lemma) as unique_lemma_count
    from {{ ref('slv_panel_lemma_membership') }}
    group by 1, 2, 3, 4
)
select
    cast('{{ var("as_of_date") }}' as date) as as_of_date,
    '{{ var("release_id") }}' as release_id,
    '{{ var("metric_definition_version") }}' as metric_definition_version,
    ps.manga_id || ':' || ps.language || ':' || ps.scan_mode || ':v' || cast(ps.pipeline_version as varchar) as mart_row_key,
    ps.manga_id,
    m.manga_title_raw as manga_title,
    ps.language,
    ps.scan_mode,
    ps.pipeline_version,
    mep.eligible_downloaded_pages,
    ps.current_scanned_pages,
    ps.stale_scanned_pages,
    ps.current_scanned_pages::double / nullif(mep.eligible_downloaded_pages, 0)::double as page_scan_coverage_rate,
    ps.panel_count,
    ps.panels_with_text_count,
    coalesce(ta.token_occurrence_count, 0) as token_occurrence_count,
    coalesce(la.unique_lemma_count, 0) as unique_lemma_count,
    case
        when coalesce(ta.token_occurrence_count, 0) > 0
            then coalesce(la.unique_lemma_count, 0)::double / ta.token_occurrence_count::double
        else null
    end as type_token_ratio,
    case
        when coalesce(ta.token_occurrence_count, 0) > 0
            then coalesce(ta.noun_tokens, 0)::double / ta.token_occurrence_count::double
        else null
    end as noun_share,
    case
        when coalesce(ta.token_occurrence_count, 0) > 0
            then coalesce(ta.verb_tokens, 0)::double / ta.token_occurrence_count::double
        else null
    end as verb_share,
    case
        when coalesce(ta.token_occurrence_count, 0) > 0
            then coalesce(ta.adj_tokens, 0)::double / ta.token_occurrence_count::double
        else null
    end as adj_share,
    case
        when coalesce(ta.token_occurrence_count, 0) > 0
            then coalesce(ta.unknown_pos_tokens, 0)::double / ta.token_occurrence_count::double
        else null
    end as unknown_pos_share,
    case
        when ps.current_scanned_pages > 0
            then coalesce(ta.token_occurrence_count, 0)::double / ps.current_scanned_pages::double
        else null
    end as tokens_per_scanned_page,
    false as is_full_manga_text,
    case
        when ps.current_scanned_pages < 50 or (ps.current_scanned_pages::double / nullif(mep.eligible_downloaded_pages, 0)::double) < 0.10
            then 'insufficient_data'
        when ps.current_scanned_pages < 200 or (ps.current_scanned_pages::double / nullif(mep.eligible_downloaded_pages, 0)::double) < 0.50
            then 'low'
        when ps.current_scanned_pages < 500 then 'medium'
        else 'high'
    end as reliability_status,
    case
        when ps.current_scanned_pages < 50 or ps.stale_scanned_pages > 0 then 1
        else 0
    end as quality_warning_count,
    'Covers scanned chapter pages only (not full manga text); compare only within matching language, scan_mode, and pipeline_version.' as interpretation_caveat
from page_scope ps
inner join {{ ref('slv_manga_current') }} m using (manga_id)
inner join manga_eligible_pages mep using (manga_id)
left join token_agg ta
    on ps.manga_id = ta.manga_id
    and ps.language = ta.language
    and ps.scan_mode = ta.scan_mode
    and ps.pipeline_version = ta.pipeline_version
left join lemma_agg la
    on ps.manga_id = la.manga_id
    and ps.language = la.language
    and ps.scan_mode = la.scan_mode
    and ps.pipeline_version = la.pipeline_version
