import sys
import os
import asyncio

# Adjust Python path to load backend module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Ensure stdout uses UTF-8 to prevent 'charmap' encoding errors on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from backend.database.connection import connect_to_mongo, close_mongo_connection, get_db
from backend.services.manga_service import manga_service

async def update_manga_metadata():
    print("--- Starting Manga Metadata Sync Script ---")
    
    try:
        await connect_to_mongo()
        db = get_db()
        
        mangas_coll = db.mangas
        cursor = mangas_coll.find({"mangadex_id": {"$ne": None}})
        mangas = await cursor.to_list(length=1000)
        print(f"Found {len(mangas)} mangas with MangaDex IDs to sync.")
        
        updated_count = 0
        
        for index, manga in enumerate(mangas):
            manga_id_str = str(manga["_id"])
            title = manga.get("title", "Unknown")
            
            print(f"[{index+1}/{len(mangas)}] Syncing metadata and links for '{title}' ({manga_id_str})...")
            
            try:
                # Add delay to avoid aggressive rate limiting
                await asyncio.sleep(0.3)
                
                res = await manga_service.sync_manga_metadata(manga_id_str)
                if res:
                    print(f"  Successfully synced '{title}'")
                    updated_count += 1
                else:
                    print(f"  Could not sync '{title}'")
            except Exception as e:
                print(f"  Error syncing metadata for '{title}': {e}")
                
        print(f"\nCompleted! Synced metadata for {updated_count} mangas.")
        print("--- Metadata sync completed successfully! ---")
        
    except Exception as e:
        print(f"CRITICAL ERROR during metadata sync: {e}")
        sys.exit(1)
    finally:
        await close_mongo_connection()

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(update_manga_metadata())
