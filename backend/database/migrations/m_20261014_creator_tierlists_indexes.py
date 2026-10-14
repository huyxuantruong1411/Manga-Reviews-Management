"""Migration: Add indexes for creator_tierlists collection."""

from backend.database.connection import get_db

INDEX_DEFINITIONS = [
    (
        [("creator_name_normalized", 1), ("is_default", -1), ("updated_at", -1)],
        "tierlist_creator_default_updated",
    ),
    (
        [("creator_name_normalized", 1), ("created_at", -1)],
        "tierlist_creator_created",
    ),
    (
        "tiers.items.manga_id",
        "tierlist_item_manga_id",
    ),
]


async def upgrade():
    """Create indexes for creator_tierlists collection."""
    db = get_db()
    for keys, name in INDEX_DEFINITIONS:
        await db.creator_tierlists.create_index(keys, name=name)


async def downgrade():
    """Drop indexes for creator_tierlists collection."""
    db = get_db()
    existing_indexes = await db.creator_tierlists.index_information()
    for _, name in INDEX_DEFINITIONS:
        if name in existing_indexes:
            await db.creator_tierlists.drop_index(name)
