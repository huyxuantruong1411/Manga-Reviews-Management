from fastapi import APIRouter, Path, HTTPException, status, UploadFile, File
from typing import List, Any, Optional
from datetime import datetime
from bson import ObjectId
import re
from backend.database.connection import get_db
from backend.models.review import ReviewResponse, ReviewCreate, ReviewUpdate
from backend.services.minio_service import minio_service
from backend.config import settings
import uuid as uuid_lib

router = APIRouter(prefix="/api/manga", tags=["Reviews"])

def clean_tiptap_node(node: Any) -> Any:
    """Recursively traverses a Tiptap JSON document and cleans up multiple tabs,
    non-breaking spaces, and multiple consecutive spaces in text nodes."""
    if not isinstance(node, dict):
        return node
    
    if node.get("type") == "text" and "text" in node:
        text = node["text"]
        # Replace non-breaking spaces with normal spaces
        text = text.replace("\u00a0", " ")
        # Replace one or more tabs with a single space
        text = re.sub(r'\t+', " ", text)
        # Replace two or more consecutive spaces with a single space
        text = re.sub(r' {2,}', " ", text)
        node["text"] = text
        
    if "content" in node and isinstance(node["content"], list):
        for sub_node in node["content"]:
            clean_tiptap_node(sub_node)
            
    return node

@router.get("/{manga_id}/reviews", response_model=List[ReviewResponse])
async def list_reviews(manga_id: str = Path(...)):
    """List all active reviews for a manga."""
    coll = get_db().reviews
    cursor = coll.find({"manga_id": manga_id, "is_deleted": {"$ne": True}}).sort("created_at", -1)
    reviews = []
    async for doc in cursor:
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
        reviews.append(doc)
    return reviews

@router.post("/{manga_id}/reviews", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_review(manga_id: str = Path(...), data: ReviewCreate = None):
    """Create a new review for a manga."""
    # Verify manga exists
    if not ObjectId.is_valid(manga_id):
        raise HTTPException(status_code=400, detail="Invalid manga ID format")
        
    manga = await get_db().mangas.find_one({"_id": ObjectId(manga_id)})
    if not manga:
        raise HTTPException(status_code=404, detail="Manga not found")

    review_doc = {
        "manga_id": manga_id,
        "title": data.title,
        "content_json": data.content_json,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "is_deleted": False
    }
    
    res = await get_db().reviews.insert_one(review_doc)
    review_doc["_id"] = str(res.inserted_id)
    
    # Audit log
    await get_db().audit_logs.insert_one({
        "entity_type": "manga",
        "entity_id": manga_id,
        "action": "create_review",
        "field": "reviews",
        "new_value": str(res.inserted_id),
        "timestamp": datetime.utcnow(),
        "note": f"Created review: {data.title}"
    })
    
    return review_doc

@router.put("/{manga_id}/reviews/{review_id}", response_model=ReviewResponse)
async def update_review(manga_id: str = Path(...), review_id: str = Path(...), data: ReviewUpdate = None):
    """Update a review's title or rich content."""
    if not ObjectId.is_valid(review_id):
        raise HTTPException(status_code=400, detail="Invalid review ID format")
        
    coll = get_db().reviews
    existing = await coll.find_one({"_id": ObjectId(review_id), "manga_id": manga_id, "is_deleted": {"$ne": True}})
    if not existing:
        raise HTTPException(status_code=404, detail="Review not found")

    update_dict = {}
    if data.title is not None:
        update_dict["title"] = data.title
    if data.content_json is not None:
        update_dict["content_json"] = data.content_json

    if update_dict:
        update_dict["updated_at"] = datetime.utcnow()
        await coll.update_one({"_id": ObjectId(review_id)}, {"$set": update_dict})
        
    updated = await coll.find_one({"_id": ObjectId(review_id)})
    if updated and "_id" in updated:
        updated["_id"] = str(updated["_id"])
    return updated

@router.delete("/{manga_id}/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(manga_id: str = Path(...), review_id: str = Path(...)):
    """Soft delete a review."""
    if not ObjectId.is_valid(review_id):
        raise HTTPException(status_code=400, detail="Invalid review ID")
        
    coll = get_db().reviews
    res = await coll.update_one(
        {"_id": ObjectId(review_id), "manga_id": manga_id},
        {"$set": {"is_deleted": True, "updated_at": datetime.utcnow()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Review not found")
        
    # Audit log
    await get_db().audit_logs.insert_one({
        "entity_type": "manga",
        "entity_id": manga_id,
        "action": "delete_review",
        "field": "reviews",
        "old_value": review_id,
        "timestamp": datetime.utcnow(),
        "note": "Deleted review"
    })
    return None

@router.post("/{manga_id}/reviews/{review_id}/cleanup", response_model=ReviewResponse)
async def cleanup_review_tabs(manga_id: str = Path(...), review_id: str = Path(...)):
    """Cleanup double/multiple tabs in the review rich-text content JSON."""
    if not ObjectId.is_valid(review_id):
        raise HTTPException(status_code=400, detail="Invalid review ID")
        
    coll = get_db().reviews
    review = await coll.find_one({"_id": ObjectId(review_id), "manga_id": manga_id, "is_deleted": {"$ne": True}})
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
        
    content_json = review.get("content_json")
    if content_json:
        cleaned_content = clean_tiptap_node(content_json)
        await coll.update_one(
            {"_id": ObjectId(review_id)},
            {"$set": {"content_json": cleaned_content, "updated_at": datetime.utcnow()}}
        )
        review["content_json"] = cleaned_content
        
    if review and "_id" in review:
        review["_id"] = str(review["_id"])
    return review


REVIEW_IMAGES_BUCKET = "review-images"


@router.post("/{manga_id}/reviews/upload-image")
async def upload_review_image(manga_id: str = Path(...), file: UploadFile = File(...)):
    """Upload an image to MinIO for use in review content. Returns the public URL."""
    if not ObjectId.is_valid(manga_id):
        raise HTTPException(status_code=400, detail="Invalid manga ID format")

    # Validate file type
    allowed_types = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, GIF, and WebP images are allowed")

    # Generate unique filename
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    unique_name = f"{uuid_lib.uuid4().hex}.{ext}"
    object_key = f"{manga_id}/{unique_name}"

    minio = minio_service.client

    # Ensure bucket exists
    try:
        if not minio.bucket_exists(REVIEW_IMAGES_BUCKET):
            minio.make_bucket(REVIEW_IMAGES_BUCKET)
            import json
            policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"AWS": ["*"]},
                        "Action": ["s3:GetObject"],
                        "Resource": [f"arn:aws:s3:::{REVIEW_IMAGES_BUCKET}/*"]
                    }
                ]
            }
            minio.set_bucket_policy(REVIEW_IMAGES_BUCKET, json.dumps(policy))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MinIO bucket error: {str(e)}")

    # Upload
    try:
        import io
        content = await file.read()
        minio.put_object(
            REVIEW_IMAGES_BUCKET,
            object_key,
            io.BytesIO(content),
            length=len(content),
            content_type=file.content_type or "image/jpeg"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    # Build public URL
    endpoint = settings.minio_endpoint
    if not endpoint.startswith("http"):
        endpoint = f"http://{endpoint}"
    url = f"{endpoint}/{REVIEW_IMAGES_BUCKET}/{object_key}"

    return {"url": url, "key": object_key, "bucket": REVIEW_IMAGES_BUCKET}
