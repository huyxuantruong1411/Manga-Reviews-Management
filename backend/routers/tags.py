from fastapi import APIRouter, Query, HTTPException, Path, status
from typing import List, Optional
from datetime import datetime
import re
from bson import ObjectId
from backend.database.connection import get_db
from backend.models.tag import TagResponse, TagCreate

router = APIRouter(prefix="/api/tags", tags=["Tags"])

@router.get("/", response_model=List[TagResponse])
async def list_tags(source: Optional[str] = Query(None, description="Filter by source: mangadex or custom")):
    coll = get_db().tags
    query = {}
    if source:
        query["source"] = source
        
    cursor = coll.find(query).sort([("source", 1), ("name.en", 1)])
    tags = []
    async for doc in cursor:
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        tags.append(doc)
    return tags

@router.post("/", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_tag(data: TagCreate):
    """Create a new custom tag."""
    coll = get_db().tags
    
    # Check if duplicate custom tag exists (case insensitive check for English name)
    en_name = data.name.get("en", "").strip()
    if not en_name:
        raise HTTPException(status_code=400, detail="Tag English name is required")
        
    existing = await coll.find_one({
        "source": "custom",
        "name.en": {"$regex": f"^{re.escape(en_name)}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Custom tag with this name already exists")

    tag_doc = {
        "mangadex_id": None,
        "source": "custom",
        "name": {
            "en": en_name,
            "vi": data.name.get("vi", "").strip() or None
        },
        "group": data.group or "custom",
        "description": data.description,
        "color": data.color,
        "created_at": datetime.utcnow()
    }
    
    res = await coll.insert_one(tag_doc)
    tag_doc["_id"] = str(res.inserted_id)
    return tag_doc

@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_tag(tag_id: str = Path(...)):
    """Delete a custom tag. MangaDex tags cannot be deleted."""
    if not ObjectId.is_valid(tag_id):
        raise HTTPException(status_code=400, detail="Invalid tag ID")
        
    coll = get_db().tags
    tag = await coll.find_one({"_id": ObjectId(tag_id)})
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
        
    if tag.get("source") != "custom":
        raise HTTPException(status_code=403, detail="Cannot delete standard MangaDex tags")
        
    # Remove from mangas tag lists
    await get_db().mangas.update_many(
        {"tag_ids": tag_id},
        {"$pull": {"tag_ids": tag_id}}
    )
    
    await coll.delete_one({"_id": ObjectId(tag_id)})
    return None

@router.put("/{tag_id}", response_model=TagResponse)
async def update_tag(tag_id: str = Path(...), data: TagCreate = ...):
    """Update a custom tag. Standard tags' color/description can be updated too."""
    if not ObjectId.is_valid(tag_id):
        raise HTTPException(status_code=400, detail="Invalid tag ID")
        
    coll = get_db().tags
    tag = await coll.find_one({"_id": ObjectId(tag_id)})
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
        
    en_name = data.name.get("en", "").strip()
    if not en_name:
        raise HTTPException(status_code=400, detail="Tag English name is required")
        
    # Check if name is changed and if new name is duplicate
    if en_name.lower() != tag["name"]["en"].lower():
        existing = await coll.find_one({
            "_id": {"$ne": ObjectId(tag_id)},
            "name.en": {"$regex": f"^{re.escape(en_name)}$", "$options": "i"}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Another tag with this name already exists")
            
    # Prepare update (fully updates all properties)
    update_doc = {
        "color": data.color,
        "description": data.description,
        "group": data.group or "custom",
        "name": {
            "en": en_name,
            "vi": data.name.get("vi", "").strip() or None
        }
    }
        
    await coll.update_one({"_id": ObjectId(tag_id)}, {"$set": update_doc})
    
    updated_tag = await coll.find_one({"_id": ObjectId(tag_id)})
    if updated_tag:
        updated_tag["_id"] = str(updated_tag["_id"])
    return updated_tag

