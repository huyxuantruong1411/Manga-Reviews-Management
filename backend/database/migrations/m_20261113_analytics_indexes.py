"""Index-only migration for Analytics aggregation & velocity query performance."""

from backend.database.connection import get_db
from backend.database.indexes import ANALYTICS_INDEXES, ensure_analytics_indexes


async def upgrade():
    await ensure_analytics_indexes(get_db())


async def downgrade():
    db = get_db()
    for collection, _, name, _ in ANALYTICS_INDEXES:
        indexes = await db[collection].index_information()
        if name in indexes:
            await db[collection].drop_index(name)
