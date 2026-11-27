select
    m.review_id,
    m.manga_id,
    r.manga_exists,
    r.manga_personal_rating,
    r.manga_read_status,
    r.is_finalized,
    m.snapshot_date,
    m.aspect,
    m.mention_seq,
    m.span_start,
    m.span_end,
    m.confidence,
    m.classifier_method,
    m.taxonomy_version,
    m.sentiment_enabled
from {{ silver_private_parquet('review_aspect_mentions.parquet') }} m
inner join {{ ref('slv_review_current') }} r
    on m.review_id = r.review_id
