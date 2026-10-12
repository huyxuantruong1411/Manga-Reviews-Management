"""Index-only migration; no document changes or status-history backfill."""

from backend.database.connection import get_db
from backend.database.indexes import DELETION_REFERENCE_INDEXES, ensure_deletion_reference_indexes


async def upgrade():
    await ensure_deletion_reference_indexes(get_db())


async def downgrade():
    db = get_db()
    for collection, _, name in DELETION_REFERENCE_INDEXES:
        indexes = await db[collection].index_information()
        if name in indexes:
            await db[collection].drop_index(name)
