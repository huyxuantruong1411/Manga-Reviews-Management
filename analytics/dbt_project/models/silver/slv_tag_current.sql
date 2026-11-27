select
    _source_id as tag_id,
    _snapshot_date as snapshot_date,
    _ingested_at as ingested_at,
    _batch_id as batch_id,
    _document_hash as document_hash,
    {{ ejson_str('_document_ejson', '$.mangadex_id') }} as mangadex_id,
    coalesce(nullif({{ ejson_str('_document_ejson', '$.source') }}, ''), 'custom') as tag_source,
    coalesce(nullif({{ ejson_str('_document_ejson', '$.group') }}, ''), 'custom') as tag_group,
    {{ ejson_str('_document_ejson', '$.name.en') }} as tag_name_en,
    {{ ejson_str('_document_ejson', '$.name.vi') }} as tag_name_vi,
    coalesce(
        nullif({{ ejson_str('_document_ejson', '$.name.en') }}, ''),
        nullif({{ ejson_str('_document_ejson', '$.name.vi') }}, ''),
        _source_id
    ) as tag_label,
    {{ ejson_ts('_document_ejson', '$.created_at') }} as created_at,
    {{ ejson_ts('_document_ejson', '$.updated_at') }} as updated_at
from {{ ref('brz_tags') }}
qualify row_number() over (
    partition by _source_id
    order by _snapshot_date desc, {{ ejson_ts('_document_ejson', '$.updated_at') }} desc nulls last, _ingested_at desc
) = 1
