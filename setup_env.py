import sys
import subprocess

# Ensure necessary packages are installed
required_packages = ["pymongo", "minio", "requests"]
for package in required_packages:
    try:
        __import__(package)
    except ImportError:
        print(f"Installing missing dependency: {package}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])

import requests
from pymongo import MongoClient
from minio import Minio
from minio.error import S3Error

# Configuration
MONGO_URI = "mongodb://localhost:27017/"
DB_NAME = "manga_library"
MINIO_ENDPOINT = "localhost:9000"
MINIO_ACCESS_KEY = "admin"
MINIO_SECRET_KEY = "password"
MINIO_BUCKET = "manga-library"

def setup_mongodb():
    print("--- Setting up MongoDB ---")
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        # Check connection
        client.server_info()
        print("Connected to MongoDB successfully.")
        
        db = client[DB_NAME]
        
        # Create indexes
        print("Creating indexes on 'mangas' collection...")
        db.mangas.create_index("mangadex_id", sparse=True)
        db.mangas.create_index("read_status")
        db.mangas.create_index("tag_ids")
        db.mangas.create_index([("title", "text")], default_language="none")
        db.mangas.create_index("added_at")
        db.mangas.create_index("personal_rating", sparse=True)
        
        print("Creating indexes on 'reviews' collection...")
        db.reviews.create_index("manga_id")
        db.reviews.create_index("created_at")
        
        print("Creating indexes on 'audit_logs' collection...")
        db.audit_logs.create_index([("entity_id", 1), ("timestamp", -1)])
        
        print("Creating indexes on 'tags' collection...")
        db.tags.create_index("mangadex_id", sparse=True)
        db.tags.create_index("source")
        
        print("MongoDB indexes created successfully.")
        return db
    except Exception as e:
        print(f"Error setting up MongoDB: {e}")
        return None

def setup_minio():
    print("--- Setting up MinIO ---")
    try:
        minio_client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=False
        )
        
        # Check if bucket exists
        found = minio_client.bucket_exists(MINIO_BUCKET)
        if not found:
            print(f"Bucket '{MINIO_BUCKET}' does not exist. Creating it...")
            minio_client.make_bucket(MINIO_BUCKET)
            print(f"Bucket '{MINIO_BUCKET}' created.")
        else:
            print(f"Bucket '{MINIO_BUCKET}' already exists.")
            
        # We can set the bucket policy to public read to ease local development,
        # but the plan states we use presigned URLs. So keeping it private or setting
        # to custom public read. Let's make sure it is accessible.
        # Setting read-only policy for bucket (anonymous read for cover images):
        policy = f'''{{
            "Version": "2012-10-17",
            "Statement": [
                {{
                    "Effect": "Allow",
                    "Principal": {{"AWS": ["*"]}},
                    "Action": ["s3:GetObject"],
                    "Resource": ["arn:aws:s3:::{MINIO_BUCKET}/*"]
                }}
            ]
        }}'''
        minio_client.set_bucket_policy(MINIO_BUCKET, policy.strip())
        print(f"Set read-only policy for anonymous access on '{MINIO_BUCKET}' bucket.")
        
    except Exception as e:
        print(f"Error setting up MinIO: {e}")

def seed_tags(db):
    print("--- Seeding Tags from MangaDex ---")
    if db is None:
        print("MongoDB not available, skipping tag seeding.")
        return
        
    # Check if tags already exist
    existing_tags_count = db.tags.count_documents({})
    if existing_tags_count > 0:
        print(f"Tags collection already contains {existing_tags_count} tags. Skipping seeding.")
        return
        
    try:
        print("Fetching tags from MangaDex API...")
        response = requests.get("https://api.mangadex.org/manga/tag", timeout=15)
        response.raise_for_status()
        data = response.json()
        
        tags_to_insert = []
        import datetime
        
        for item in data.get("data", []):
            attr = item.get("attributes", {})
            tag_id = item.get("id")
            
            # Localized tag names
            name_dict = attr.get("name", {})
            
            tag_doc = {
                "mangadex_id": tag_id,
                "source": "mangadex",
                "name": {
                    "en": name_dict.get("en", ""),
                    "vi": name_dict.get("vi")
                },
                "group": attr.get("group"),
                "description": attr.get("description"),
                "created_at": datetime.datetime.utcnow()
            }
            tags_to_insert.append(tag_doc)
            
        if tags_to_insert:
            db.tags.insert_many(tags_to_insert)
            print(f"Successfully seeded {len(tags_to_insert)} tags from MangaDex.")
        else:
            print("No tags found from MangaDex response.")
    except Exception as e:
        print(f"Error seeding tags from MangaDex: {e}")

if __name__ == "__main__":
    db = setup_mongodb()
    setup_minio()
    seed_tags(db)
    print("--- Environment Setup Completed ---")
