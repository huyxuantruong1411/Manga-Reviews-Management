with release_agg as (
    select
        manga_id,
        count(*) as physical_release_count,
        count(*) filter (where chapter_state = 'ready') as ready_release_count,
        count(distinct language) as distinct_language_count,
        count(distinct source) as distinct_source_count,
        sum(page_count) as total_chapter_page_count
    from {{ ref('slv_chapter_release') }}
    where manga_exists
    group by manga_id
),
slot_agg as (
    select
        manga_id,
        count(*) filter (where not is_excluded) as logical_slot_count,
        count(*) filter (where not is_excluded and preferred_chapter_id is not null) as covered_slot_count
    from {{ ref('slv_chapter_slot') }}
    group by manga_id
)
select
    m.manga_id,
    m.declared_chapters as metadata_declared_chapters,
    coalesce(r.physical_release_count, 0) as physical_release_count,
    coalesce(r.ready_release_count, 0) as ready_release_count,
    coalesce(s.logical_slot_count, 0) as logical_slot_count,
    coalesce(s.covered_slot_count, 0) as covered_slot_count,
    coalesce(r.distinct_language_count, 0) as distinct_language_count,
    coalesce(r.distinct_source_count, 0) as distinct_source_count,
    coalesce(r.total_chapter_page_count, 0) as total_downloaded_page_count,
    m.snapshot_date
from {{ ref('slv_manga_current') }} m
left join release_agg r
    on m.manga_id = r.manga_id
left join slot_agg s
    on m.manga_id = s.manga_id
