import sys
import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from minio import Minio
from datetime import datetime

# Adjust Python path to load backend module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.config import settings
from backend.database.indexes import init_db_indexes

async def seed_tags(db):
    print("Checking tags collection...")
    # Default tags we want to pre-seed
    default_tags = [
        {"name": {"en": "Action", "vi": "Hành động"}, "color": "#E11D48", "group": "genre"},
        {"name": {"en": "Adventure", "vi": "Phiêu lưu"}, "color": "#EA580C", "group": "genre"},
        {"name": {"en": "Comedy", "vi": "Hài hước"}, "color": "#D97706", "group": "genre"},
        {"name": {"en": "Drama", "vi": "Kịch tính"}, "color": "#7C3AED", "group": "genre"},
        {"name": {"en": "Fantasy", "vi": "Giả tưởng"}, "color": "#2563EB", "group": "genre"},
        {"name": {"en": "Romance", "vi": "Lãng mạn"}, "color": "#DB2777", "group": "genre"},
        {"name": {"en": "Sci-Fi", "vi": "Khoa học viễn tưởng"}, "color": "#0891B2", "group": "theme"},
        {"name": {"en": "Slice of Life", "vi": "Đời thường"}, "color": "#059669", "group": "genre"},
        {"name": {"en": "Mystery", "vi": "Bí ẩn"}, "color": "#4F46E5", "group": "genre"},
        {"name": {"en": "Horror", "vi": "Kinh dị"}, "color": "#DC2626", "group": "genre"},
        {"name": {"en": "Psychological", "vi": "Tâm lý"}, "color": "#1F2937", "group": "genre"},
    ]

    # Clean up any bad tags with string-type description
    delete_res = await db.tags.delete_many({"source": "custom", "description": {"$type": "string"}})
    if delete_res.deleted_count > 0:
        print(f"Cleaned up {delete_res.deleted_count} legacy tags with string descriptions.")

    inserted_count = 0
    for t in default_tags:
        en_name = t["name"]["en"]
        existing = await db.tags.find_one({"source": "custom", "name.en": en_name})
        if not existing:
            tag_doc = {
                "mangadex_id": None,
                "source": "custom",
                "name": t["name"],
                "group": t["group"],
                "description": {"en": f"Pre-seeded custom genre: {en_name}"},
                "color": t["color"],
                "created_at": datetime.utcnow()
            }
            await db.tags.insert_one(tag_doc)
            inserted_count += 1
            print(f"Pre-seeded tag: {en_name}")

    print(f"Pre-seeding done. Seeded {inserted_count} new tags.")

def setup_minio():
    print(f"Checking MinIO bucket: '{settings.minio_bucket}'...")
    try:
        client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=False
        )
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)
            print(f"Created MinIO bucket '{settings.minio_bucket}' successfully.")
        else:
            print(f"MinIO bucket '{settings.minio_bucket}' already exists.")
    except Exception as e:
        print(f"WARNING: Could not connect to MinIO or initialize bucket: {e}")

async def main():
    print("--- Starting Project Setup Script ---")
    
    # Setup MinIO
    setup_minio()
    
    # Setup MongoDB
    print(f"Connecting to MongoDB at: {settings.mongodb_uri} ...")
    try:
        client = AsyncIOMotorClient(settings.mongodb_uri)
        db = client[settings.database_name]
        
        # Test connection
        await client.admin.command('ping')
        print("Connected to MongoDB successfully!")
        
        # Seed tags
        await seed_tags(db)
        
        # Initialize Indexes
        # Need to ensure the connection.py client is also initialized for connection reference
        # But connection helper has its own globals. Let's patch it
        from backend.database.connection import db_instance
        db_instance.client = client
        db_instance.db = db
        await init_db_indexes()
        
        print("--- Setup script completed successfully! ---")
    except Exception as e:
        print(f"CRITICAL ERROR during setup: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
