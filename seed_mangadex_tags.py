import asyncio
import os
import sys
from datetime import datetime

import httpx
from motor.motor_asyncio import AsyncIOMotorClient

# Adjust Python path to load backend module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.config import settings


async def seed_mangadex_tags():
    print("--- Starting MangaDex Tags Seeding Script ---")
    print(f"Connecting to MongoDB at: {settings.mongodb_uri} ...")
    try:
        client = AsyncIOMotorClient(settings.mongodb_uri)
        db = client[settings.database_name]

        # Test connection
        await client.admin.command("ping")
        print("Connected to MongoDB successfully!")

        # Fetch tags from MangaDex
        url = "https://api.mangadex.org/manga/tag"
        print(f"Fetching tags from: {url}")
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            resp = await http_client.get(url)
            resp.raise_for_status()
            data = resp.json()

        tags = data.get("data", [])
        print(f"Retrieved {len(tags)} tags from MangaDex API.")

        inserted_count = 0
        updated_count = 0

        for t in tags:
            tag_id = t["id"]
            attr = t.get("attributes", {})
            name = attr.get("name", {})
            group = attr.get("group", "custom")
            description = attr.get("description", {})

            # Check if tag already exists by mangadex_id
            existing = await db.tags.find_one({"mangadex_id": tag_id})

            tag_doc = {
                "mangadex_id": tag_id,
                "source": "mangadex",
                "name": name,
                "group": group,
                "description": description,
                "updated_at": datetime.utcnow(),
            }

            if not existing:
                # Assign a default color based on custom theme rules
                name_en = name.get("en", "")
                name_lower = name_en.lower()
                if name_lower in ["gore", "sexual violence", "mature"]:
                    color_val = "#ef4444"
                elif name_lower in ["suggestive"]:
                    color_val = "#eab308"
                elif name_lower in ["doujinshi"]:
                    color_val = "#7c3aed"
                else:
                    color_val = "#3f3f46"
                tag_doc["color"] = color_val
                tag_doc["created_at"] = datetime.utcnow()
                await db.tags.insert_one(tag_doc)
                inserted_count += 1
            else:
                # Update existing
                await db.tags.update_one({"mangadex_id": tag_id}, {"$set": tag_doc})
                updated_count += 1

        print(f"Completed! Seeded {inserted_count} new tags, updated {updated_count} existing tags.")
        print("--- Seeding script completed successfully! ---")

    except Exception as e:
        print(f"CRITICAL ERROR during tags seeding: {e}")
        sys.exit(1)


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(seed_mangadex_tags())
