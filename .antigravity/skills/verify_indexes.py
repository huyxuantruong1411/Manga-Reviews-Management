"""
Verify Database Indexes Script
Kiểm tra tính đầy đủ của các index bắt buộc (Foreign Keys, Sort keys) trên MongoDB.
"""

import asyncio
import logging
import os
import sys

# Add root folder to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.database.connection import close_mongo_connection, connect_to_mongo, get_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("index_verifier")

MANDATORY_INDEXES = {
    "mangas": ["mangadex_id", "read_status", "tag_ids", "added_at"],
    "reviews": ["manga_id", "created_at"],
    "chapters": ["manga_id", "created_at"],
    "audit_logs": ["timestamp"],
    "reading_progress": ["manga_id"],
    "manga_panels": ["manga_id", "chapter_id", "language", "scan_mode", "lemmas"],
}


async def verify():
    logger.info("Verifying mandatory database indexes...")
    await connect_to_mongo()
    db = get_db()
    missing_count = 0

    for collection_name, required_keys in MANDATORY_INDEXES.items():
        collection = db[collection_name]
        existing_indexes = await collection.index_information()
        indexed_fields = set()
        for idx_meta in existing_indexes.values():
            for key_tuple in idx_meta.get("key", []):
                indexed_fields.add(key_tuple[0])

        for key in required_keys:
            if key not in indexed_fields:
                logger.error(f"❌ Missing index on collection '{collection_name}' for key: '{key}'")
                missing_count += 1
            else:
                logger.info(f"✅ Verified index on '{collection_name}.{key}'")

    await close_mongo_connection()
    if missing_count > 0:
        logger.error(f"Total missing mandatory indexes: {missing_count}")
        return False
    logger.info("All mandatory indexes are present and healthy!")
    return True


if __name__ == "__main__":
    success = asyncio.run(verify())
    sys.exit(0 if success else 1)
