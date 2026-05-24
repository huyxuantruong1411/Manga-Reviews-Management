import asyncio
import sys
import os

# Set python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database.connection import connect_to_mongo, get_db
from backend.models.manga import MangaResponse

async def test_all_mangas():
    await connect_to_mongo()
    print("Connected to MongoDB!")
    
    db = get_db()
    count = await db.mangas.count_documents({})
    print(f"Total mangas in DB: {count}")
    
    cursor = db.mangas.find({})
    async for doc in cursor:
        manga_id = str(doc.get("_id"))
        title = doc.get("title", "Unknown")
        print(f"Validating manga {manga_id} - '{title}'...")
        try:
            # Check fields
            for k, v in doc.items():
                if isinstance(v, dict):
                    print(f"  Field {k}: {type(v)} -> {v}")
                elif isinstance(v, list):
                    print(f"  Field {k}: list of length {len(v)}")
            
            validated = MangaResponse.model_validate(doc)
            json_data = validated.model_dump_json(by_alias=True)
            print(f"  Manga {manga_id} validated and serialized successfully!")
        except Exception as e:
            print(f"  Manga {manga_id} FAILED:")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_all_mangas())
