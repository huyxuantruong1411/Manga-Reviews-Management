import asyncio
import sys
import os

# Set python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database.connection import connect_to_mongo
from backend.services.manga_service import manga_service
from backend.models.manga import MangaPaginationResponse

async def test():
    await connect_to_mongo()
    print("Connected to MongoDB!")
    
    # Let's get mangas
    res = await manga_service.get_mangas(limit=5)
    print(f"Manga Service returned {len(res.get('items', []))} items.")
    
    try:
        # Validate using MangaPaginationResponse
        validated = MangaPaginationResponse.model_validate(res)
        print("Validated successfully!")
        
        # Serialize to json
        json_data = validated.model_dump_json(by_alias=True)
        print("Serialized JSON successfully! Length:", len(json_data))
    except Exception as e:
        print("Validation/Serialization failed!")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
