"""Migration: Add indexes for external_reviews collection."""

from backend.database.connection import get_db

INDEX_DEFINITIONS = [
    (
        [("manga_id", 1), ("source", 1), ("source_review_id", 1)],
        "ext_reviews_unique_source_review",
        {"unique": True},
    ),
    (
        [("manga_id", 1), ("source", 1), ("posted_at", -1)],
        "ext_reviews_manga_source_posted",
        {},
    ),
    (
        [("manga_id", 1), ("recommendation_status", 1)],
        "ext_reviews_manga_recommendation",
        {},
    ),
    (
        [("manga_id", 1), ("is_spoiler", 1), ("is_preliminary", 1)],
        "ext_reviews_manga_flags",
        {},
    ),
    (
        [("manga_id", 1), ("reactions.total", -1)],
        "ext_reviews_manga_reactions",
        {},
    ),
    (
        "manga_id",
        "deletion_external_reviews_manga",
        {},
    ),
]


async def upgrade():
    """Create indexes for external_reviews collection."""
    db = get_db()
    for keys, name, kwargs in INDEX_DEFINITIONS:
        await db.external_reviews.create_index(keys, name=name, **kwargs)


async def downgrade():
    """Drop indexes for external_reviews collection."""
    db = get_db()
    existing_indexes = await db.external_reviews.index_information()
    for _, name, _ in INDEX_DEFINITIONS:
        if name in existing_indexes:
            await db.external_reviews.drop_index(name)
