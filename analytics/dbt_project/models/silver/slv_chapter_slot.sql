select
    _source_id as slot_id,
    {{ ejson_str('_document_ejson', '$.manga_id') }} as manga_id,
    lower(trim(coalesce({{ ejson_str('_document_ejson', '$.language') }}, 'unknown'))) as language,
    lower(trim(coalesce({{ ejson_str('_document_ejson', '$.unit_kind') }}, 'chapter'))) as unit_kind,
    {{ ejson_str('_document_ejson', '$.numbering_scope_id') }} as numbering_scope_id,
    {{ ejson_str('_document_ejson', '$.chapter_key') }} as chapter_key,
    {{ ejson_str('_document_ejson', '$.chapter_display') }} as chapter_display,
    {{ ejson_str('_document_ejson', '$.preferred_chapter_id') }} as preferred_chapter_id,
    lower(trim(coalesce({{ ejson_str('_document_ejson', '$.mapping_state') }}, 'verified'))) as mapping_state,
    coalesce({{ ejson_bool('_document_ejson', '$.is_excluded') }}, false) as is_excluded,
    {{ ejson_ts('_document_ejson', '$.created_at') }} as created_at,
    {{ ejson_ts('_document_ejson', '$.updated_at') }} as updated_at,
    _snapshot_date as snapshot_date,
    _ingested_at as ingested_at,
    _batch_id as batch_id,
    _document_hash as document_hash
from {{ ref('brz_chapter_slots') }}
qualify row_number() over (
    partition by _source_id
    order by _snapshot_date desc, {{ ejson_ts('_document_ejson', '$.updated_at') }} desc nulls last, _ingested_at desc
) = 1
