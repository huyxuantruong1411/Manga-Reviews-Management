from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings
import logging

logger = logging.getLogger(__name__)

class Database:
    client: AsyncIOMotorClient = None
    db = None

db_instance = Database()

def get_db():
    if db_instance.db is None:
        raise RuntimeError("Database connection not initialized.")
    return db_instance.db

async def connect_to_mongo():
    logger.info("Connecting to MongoDB...")
    db_instance.client = AsyncIOMotorClient(settings.mongodb_uri)
    db_instance.db = db_instance.client[settings.database_name]
    # Verify connection
    await db_instance.client.admin.command('ping')
    logger.info("Connected to MongoDB successfully.")

async def close_mongo_connection():
    if db_instance.client:
        logger.info("Closing MongoDB connection...")
        db_instance.client.close()
        db_instance.client = None
        db_instance.db = None
        logger.info("MongoDB connection closed.")
