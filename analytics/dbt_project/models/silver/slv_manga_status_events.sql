with dedup_events as (
    select
        _source_id as event_id,
        {{ ejson_str('_document_ejson', '$.entity_type') }} as entity_type,
        {{ ejson_str('_document_ejson', '$.entity_id') }} as manga_id,
        lower(trim({{ ejson_str('_document_ejson', '$.action') }})) as action,
        {{ ejson_str('_document_ejson', '$.field') }} as field_name,
        {{ ejson_str('_document_ejson', '$.old_value') }} as old_value_raw,
        {{ ejson_str('_document_ejson', '$.new_value') }} as new_value_raw,
        coalesce({{ ejson_str('_document_ejson', '$.actor') }}, 'user') as actor,
        {{ ejson_ts('_document_ejson', '$.timestamp') }} as event_at,
        _snapshot_date as snapshot_date,
        _ingested_at as ingested_at,
        _batch_id as batch_id
    from {{ ref('brz_audit_logs') }}
    where {{ ejson_str('_document_ejson', '$.entity_type') }} = 'manga'
      and lower(trim({{ ejson_str('_document_ejson', '$.action') }})) in ('create', 'update_status')
    qualify row_number() over (
        partition by _source_id
        order by _snapshot_date desc, _ingested_at desc
    ) = 1
),
normalized as (
    select
        e.event_id,
        e.manga_id,
        (m.manga_id is not null) as manga_exists,
        e.action,
        e.field_name,
        case
            when e.action = 'update_status' and e.field_name = 'read_status'
                then {{ normalize_read_status('e.old_value_raw') }}
            else null
        end as from_status,
        case
            when e.action = 'update_status' and e.field_name = 'read_status'
                then {{ normalize_read_status('e.new_value_raw') }}
            when e.action = 'create' then 'unread'
            else null
        end as to_status,
        e.old_value_raw as from_status_raw,
        e.new_value_raw as to_status_raw,
        e.actor,
        e.event_at,
        m.read_status as current_manga_read_status,
        m.added_at as manga_added_at,
        e.snapshot_date,
        e.batch_id
    from dedup_events e
    left join {{ ref('slv_manga_current') }} m
        on e.manga_id = m.manga_id
),
with_latest_rank as (
    select
        *,
        row_number() over (
            partition by manga_id
            order by event_at desc, event_id desc
        ) as status_event_recency_rank
    from normalized
    where action = 'update_status' and to_status is not null
)
select
    n.event_id,
    n.manga_id,
    n.manga_exists,
    n.action,
    n.field_name,
    n.from_status,
    n.to_status,
    n.from_status_raw,
    n.to_status_raw,
    n.actor,
    n.event_at,
    n.current_manga_read_status,
    (r.status_event_recency_rank = 1) as is_latest_status_event,
    case
        when r.status_event_recency_rank = 1 and n.manga_exists
            then (n.to_status is distinct from n.current_manga_read_status)
        else false
    end as has_latest_status_conflict,
    n.snapshot_date,
    n.batch_id
from normalized n
left join with_latest_rank r
    on n.event_id = r.event_id
