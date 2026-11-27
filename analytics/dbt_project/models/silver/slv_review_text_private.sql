select
    r.review_id,
    r.manga_id,
    r.manga_exists,
    r.manga_personal_rating,
    r.manga_read_status,
    r.created_at,
    r.updated_at,
    r.review_age_days,
    f.snapshot_date,
    f.plain_text_sha256,
    f.word_count,
    f.char_count,
    f.paragraph_count,
    f.sentence_count,
    f.heading_count,
    f.blockquote_count,
    f.bullet_list_count,
    f.ordered_list_count,
    f.image_node_count,
    f.manga_ref_count,
    f.language_profile,
    f.taxonomy_version,
    f.classifier_method
from {{ ref('slv_review_current') }} r
inner join {{ silver_private_parquet('review_aspect_features.parquet') }} f
    on r.review_id = f.review_id
