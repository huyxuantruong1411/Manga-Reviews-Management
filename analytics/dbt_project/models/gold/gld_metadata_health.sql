with manga_base as (
    select
        m.*,
        coalesce(m.original_language, 'unknown') as lang_slice
    from {{ ref('slv_manga_current') }} m
),
slices as (
    select 'all_mangas' as slice_group, * from manga_base
    union all
    select
        case
            when lang_slice in ('ja', 'ko', 'zh') then 'lang_' || lang_slice
            else 'lang_other'
        end as slice_group,
        *
    from manga_base
),
field_checks as (
    select slice_group, 'personal_rating' as field_name, 'personal' as field_category,
        count(*) as eligible_manga_count,
        count(*) filter (where personal_rating is not null) as present_count,
        0 as provenance_attributed_count,
        0 as locked_manga_count,
        0 as stale_count
    from slices group by slice_group

    union all
    select slice_group, 'publication_year' as field_name, 'catalog' as field_category,
        count(*), count(*) filter (where publication_year is not null),
        count(*) filter (where metadata_provenance_count > 0),
        count(*) filter (where metadata_lock_count > 0), 0
    from slices group by slice_group

    union all
    select slice_group, 'publication_demographic' as field_name, 'catalog' as field_category,
        count(*), count(*) filter (where publication_demographic is not null),
        count(*) filter (where metadata_provenance_count > 0),
        count(*) filter (where metadata_lock_count > 0), 0
    from slices group by slice_group

    union all
    select slice_group, 'declared_chapters' as field_name, 'catalog' as field_category,
        count(*), count(*) filter (where declared_chapters is not null),
        count(*) filter (where metadata_provenance_count > 0),
        count(*) filter (where metadata_lock_count > 0), 0
    from slices group by slice_group

    union all
    select slice_group, 'declared_volumes' as field_name, 'catalog' as field_category,
        count(*), count(*) filter (where declared_volumes is not null),
        count(*) filter (where metadata_provenance_count > 0),
        count(*) filter (where metadata_lock_count > 0), 0
    from slices group by slice_group

    union all
    select slice_group, 'published_start_date' as field_name, 'catalog' as field_category,
        count(*), count(*) filter (where nullif(trim(published_start_date), '') is not null),
        count(*) filter (where metadata_provenance_count > 0),
        count(*) filter (where metadata_lock_count > 0), 0
    from slices group by slice_group

    union all
    select slice_group, 'published_end_date' as field_name, 'catalog' as field_category,
        count(*), count(*) filter (where nullif(trim(published_end_date), '') is not null),
        count(*) filter (where metadata_provenance_count > 0),
        count(*) filter (where metadata_lock_count > 0), 0
    from slices group by slice_group

    union all
    select slice_group, 'tracker_metadata' as field_name, 'external_enrichment' as field_category,
        count(*), count(*) filter (where tracker_fetched_at is not null),
        0, 0,
        count(*) filter (
            where tracker_fetched_at is not null
              and datediff('day', cast(tracker_fetched_at as date), cast('{{ var("as_of_date") }}' as date)) > 30
        )
    from slices group by slice_group

    union all
    select slice_group, 'tag_ids' as field_name, 'taxonomy' as field_category,
        count(*), count(*) filter (where tag_count_raw > 0),
        count(*) filter (where metadata_provenance_count > 0),
        count(*) filter (where metadata_lock_count > 0), 0
    from slices group by slice_group

    union all
    select slice_group, 'creators_canonical' as field_name, 'identity' as field_category,
        count(*), count(*) filter (where creator_ref_count_raw > 0),
        count(*) filter (where metadata_provenance_count > 0),
        count(*) filter (where metadata_lock_count > 0), 0
    from slices group by slice_group
),
unresolved_counts as (
    select
        (select count(*) from {{ ref('slv_manga_tag_bridge') }} where tag_resolution_status = 'missing_dimension') as unresolved_tag_links,
        (select count(*) from {{ ref('slv_manga_creator_bridge') }} where identity_confidence <> 'high') as non_high_creator_links
)
select
    cast('{{ var("as_of_date") }}' as date) as as_of_date,
    '{{ var("release_id") }}' as release_id,
    '{{ var("metric_definition_version") }}' as metric_definition_version,
    fc.slice_group || ':' || fc.field_name as mart_row_key,
    fc.slice_group,
    fc.field_name,
    fc.field_category,
    fc.eligible_manga_count,
    fc.present_count,
    fc.eligible_manga_count - fc.present_count as missing_or_null_count,
    fc.present_count::double / fc.eligible_manga_count::double as field_presence_rate,
    fc.provenance_attributed_count,
    fc.locked_manga_count,
    fc.stale_count,
    case
        when fc.field_name = 'tag_ids' and fc.slice_group = 'all_mangas' then uc.unresolved_tag_links
        when fc.field_name = 'creators_canonical' and fc.slice_group = 'all_mangas' then uc.non_high_creator_links
        else 0
    end as unresolved_or_low_conf_links,
    case
        when (fc.present_count::double / fc.eligible_manga_count::double) >= 0.90 then 'complete'
        when (fc.present_count::double / fc.eligible_manga_count::double) >= 0.50 then 'partial'
        else 'sparse'
    end as completeness_tier,
    {{ reliability_from_n('fc.eligible_manga_count', 5, 20, 50) }} as reliability_status,
    case when (fc.present_count::double / fc.eligible_manga_count::double) < 0.50 or fc.stale_count > 0 then 1 else 0 end as quality_warning_count,
    'Presence does not guarantee accuracy; field completeness and provenance are tracked separately.' as interpretation_caveat
from field_checks fc
cross join unresolved_counts uc
