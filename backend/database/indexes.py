import logging
from backend.database.connection import get_db

logger = logging.getLogger(__name__)

async def init_db_indexes():
    logger.info("Initializing database indexes...")
    db = get_db()
    try:
        # mangas
        await db.mangas.create_index("mangadex_id", sparse=True)
        await db.mangas.create_index("read_status")
        await db.mangas.create_index("tag_ids")
        await db.mangas.create_index("added_at")
        await db.mangas.create_index("personal_rating", sparse=True)

        # reviews
        await db.reviews.create_index("manga_id")
        await db.reviews.create_index("created_at")

        # audit_logs
        await db.audit_logs.create_index([("entity_id", 1), ("timestamp", -1)])

        # tags
        await db.tags.create_index("mangadex_id", sparse=True)
        await db.tags.create_index("source")

        # creators
        await db.creators.create_index("mangadex_id", sparse=True)
        await db.creators.create_index("name")
        
        logger.info("Database indexes initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing indexes: {e}")
