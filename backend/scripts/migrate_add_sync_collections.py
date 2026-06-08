import asyncio
import logging
import sys
import os

# Add root folder to path so backend module can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.database.connection import connect_to_mongo, close_mongo_connection
from backend.database.indexes import init_db_indexes

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("migration")

async def run_migration():
    logger.info("Starting database migration...")
    try:
        await connect_to_mongo()
        await init_db_indexes()
        logger.info("Database migration completed successfully!")
    except Exception as e:
        logger.error(f"Migration failed: {e}")
    finally:
        await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(run_migration())
