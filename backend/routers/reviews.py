from fastapi import APIRouter, Path, HTTPException, status, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Any, Optional
from datetime import datetime
from bson import ObjectId
import re
import io
import json
import logging
import mimetypes
from backend.database.connection import get_db
from backend.models.review import ReviewResponse, ReviewCreate, ReviewUpdate
from backend.services.minio_service import minio_service
from backend.config import settings
import uuid as uuid_lib
import httpx

logger = logging.getLogger(__name__)

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
REVIEW_VIDEOS_BUCKET = "review-videos"
REVIEW_MEDIA_BUCKET = "review-media"

# Allowed MIME types
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "image/bmp", "image/tiff"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-matroska"}
ALLOWED_AUDIO_TYPES = {"audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/flac", "audio/aac", "audio/webm"}
ALLOWED_ATTACHMENT_TYPES = {
    "application/pdf", "application/zip", "application/x-rar-compressed",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain", "text/csv", "text/markdown",
    "application/json", "application/xml",
}

MAX_VIDEO_SIZE = 500 * 1024 * 1024  # 500MB
MAX_FILE_SIZE = 100 * 1024 * 1024   # 100MB for other files


def _ensure_bucket(bucket_name: str):
    """Ensure a MinIO bucket exists with public read policy."""
    minio = minio_service.client
    if not minio.bucket_exists(bucket_name):
        minio.make_bucket(bucket_name)
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"AWS": ["*"]},
                "Action": ["s3:GetObject"],
                "Resource": [f"arn:aws:s3:::{bucket_name}/*"]
            }
        ]
    }
    minio.set_bucket_policy(bucket_name, json.dumps(policy))


def _build_public_url(bucket: str, object_key: str) -> str:
    """Build a public URL for a MinIO object."""
    endpoint = settings.minio_endpoint
    if not endpoint.startswith("http"):
        endpoint = f"http://{endpoint}"
    return f"{endpoint}/{bucket}/{object_key}"


@router.post("/{manga_id}/reviews/upload-image")
async def upload_review_image(manga_id: str = Path(...), file: UploadFile = File(...)):
    """Upload an image to MinIO for use in review content. Returns the public URL."""
    if not ObjectId.is_valid(manga_id):
        raise HTTPException(status_code=400, detail="Invalid manga ID format")

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported image type: {file.content_type}")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    unique_name = f"{uuid_lib.uuid4().hex}.{ext}"
    object_key = f"{manga_id}/{unique_name}"

    try:
        _ensure_bucket(REVIEW_IMAGES_BUCKET)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MinIO bucket error: {str(e)}")

    try:
        content = await file.read()
        minio_service.client.put_object(
            REVIEW_IMAGES_BUCKET,
            object_key,
            io.BytesIO(content),
            length=len(content),
            content_type=file.content_type or "image/jpeg"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    url = _build_public_url(REVIEW_IMAGES_BUCKET, object_key)
    return {"url": url, "key": object_key, "bucket": REVIEW_IMAGES_BUCKET}


# ---------------------------------------------------------------------------
# Feature 1: Proxy download external image URL → MinIO
# ---------------------------------------------------------------------------

class ImageUrlRequest(BaseModel):
    url: str


@router.post("/{manga_id}/reviews/upload-image-url")
async def upload_image_from_url(manga_id: str = Path(...), body: ImageUrlRequest = None):
    """Download an image from an external URL and store it in MinIO.
    This bypasses hotlink protection by downloading server-side."""
    if not ObjectId.is_valid(manga_id):
        raise HTTPException(status_code=400, detail="Invalid manga ID format")

    try:
        _ensure_bucket(REVIEW_IMAGES_BUCKET)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MinIO bucket error: {str(e)}")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            resp = await client.get(body.url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "image/*,*/*",
                "Referer": body.url,
            })
            resp.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Failed to download image: {str(e)}")

    content_type = resp.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        # Try to guess from URL
        guessed, _ = mimetypes.guess_type(body.url.split("?")[0])
        if guessed and guessed in ALLOWED_IMAGE_TYPES:
            content_type = guessed
        else:
            raise HTTPException(status_code=400, detail=f"URL does not point to a supported image (got: {content_type})")

    ext_map = {
        "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
        "image/webp": "webp", "image/svg+xml": "svg", "image/bmp": "bmp", "image/tiff": "tiff",
    }
    ext = ext_map.get(content_type, "jpg")
    unique_name = f"{uuid_lib.uuid4().hex}.{ext}"
    object_key = f"{manga_id}/{unique_name}"

    try:
        data = resp.content
        minio_service.client.put_object(
            REVIEW_IMAGES_BUCKET,
            object_key,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MinIO upload failed: {str(e)}")

    url = _build_public_url(REVIEW_IMAGES_BUCKET, object_key)
    return {"url": url, "key": object_key, "bucket": REVIEW_IMAGES_BUCKET}


# ---------------------------------------------------------------------------
# Feature 4: Video upload (streaming for large files)
# ---------------------------------------------------------------------------

@router.post("/{manga_id}/reviews/upload-video")
async def upload_review_video(manga_id: str = Path(...), file: UploadFile = File(...)):
    """Upload a video file to MinIO with streaming support for large files."""
    if not ObjectId.is_valid(manga_id):
        raise HTTPException(status_code=400, detail="Invalid manga ID format")

    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported video type: {file.content_type}. Allowed: {', '.join(ALLOWED_VIDEO_TYPES)}")

    try:
        _ensure_bucket(REVIEW_VIDEOS_BUCKET)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MinIO bucket error: {str(e)}")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "mp4"
    unique_name = f"{uuid_lib.uuid4().hex}.{ext}"
    object_key = f"{manga_id}/{unique_name}"

    # Stream upload in chunks to handle large files
    CHUNK_SIZE = 8 * 1024 * 1024  # 8MB chunks
    temp_buffer = io.BytesIO()
    total_size = 0

    try:
        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > MAX_VIDEO_SIZE:
                raise HTTPException(status_code=413, detail=f"Video exceeds maximum size of {MAX_VIDEO_SIZE // (1024*1024)}MB")
            temp_buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading upload: {str(e)}")

    temp_buffer.seek(0)

    try:
        minio_service.client.put_object(
            REVIEW_VIDEOS_BUCKET,
            object_key,
            temp_buffer,
            length=total_size,
            content_type=file.content_type or "video/mp4",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    url = _build_public_url(REVIEW_VIDEOS_BUCKET, object_key)
    return {
        "url": url,
        "key": object_key,
        "bucket": REVIEW_VIDEOS_BUCKET,
        "size": total_size,
        "filename": file.filename,
    }


# ---------------------------------------------------------------------------
# Feature 5: Generic media upload (audio + file attachments)
# ---------------------------------------------------------------------------

@router.post("/{manga_id}/reviews/upload-media")
async def upload_review_media(manga_id: str = Path(...), file: UploadFile = File(...)):
    """Upload audio or file attachments to MinIO for use in review content."""
    if not ObjectId.is_valid(manga_id):
        raise HTTPException(status_code=400, detail="Invalid manga ID format")

    all_allowed = ALLOWED_AUDIO_TYPES | ALLOWED_ATTACHMENT_TYPES | ALLOWED_IMAGE_TYPES
    if file.content_type not in all_allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    # Determine media category
    if file.content_type in ALLOWED_AUDIO_TYPES:
        media_type = "audio"
    elif file.content_type in ALLOWED_IMAGE_TYPES:
        media_type = "image"
    else:
        media_type = "attachment"

    try:
        _ensure_bucket(REVIEW_MEDIA_BUCKET)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MinIO bucket error: {str(e)}")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "bin"
    unique_name = f"{uuid_lib.uuid4().hex}.{ext}"
    object_key = f"{manga_id}/{media_type}/{unique_name}"

    # Read with size limit
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File exceeds maximum size of {MAX_FILE_SIZE // (1024*1024)}MB")

    try:
        minio_service.client.put_object(
            REVIEW_MEDIA_BUCKET,
            object_key,
            io.BytesIO(content),
            length=len(content),
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    url = _build_public_url(REVIEW_MEDIA_BUCKET, object_key)
    return {
        "url": url,
        "key": object_key,
        "bucket": REVIEW_MEDIA_BUCKET,
        "media_type": media_type,
        "filename": file.filename,
        "size": len(content),
    }


# ---------------------------------------------------------------------------
# Feature 2: Finalize review — clean orphaned media from MinIO
# ---------------------------------------------------------------------------

def _extract_media_urls_from_json(node: Any, urls: set):
    """Recursively extract all media URLs from a Tiptap JSON document."""
    if not isinstance(node, dict):
        return
    
    node_type = node.get("type", "")
    attrs = node.get("attrs", {})
    
    # Image nodes (standard and resizable)
    if node_type in ("image", "resizableImage") and attrs.get("src"):
        urls.add(attrs["src"])
    
    # Video nodes
    if node_type == "video" and attrs.get("src"):
        urls.add(attrs["src"])
    
    # Audio nodes
    if node_type == "audio" and attrs.get("src"):
        urls.add(attrs["src"])
    
    # File attachment nodes
    if node_type == "fileAttachment" and attrs.get("url"):
        urls.add(attrs["url"])
    
    # YouTube embeds are external, don't track
    
    if "content" in node and isinstance(node["content"], list):
        for child in node["content"]:
            _extract_media_urls_from_json(child, urls)


@router.post("/{manga_id}/reviews/{review_id}/finalize")
async def finalize_review(manga_id: str = Path(...), review_id: str = Path(...)):
    """Finalize a review: clean up orphaned media files from MinIO that are
    no longer referenced in the review content."""
    if not ObjectId.is_valid(review_id):
        raise HTTPException(status_code=400, detail="Invalid review ID")

    coll = get_db().reviews
    review = await coll.find_one({
        "_id": ObjectId(review_id),
        "manga_id": manga_id,
        "is_deleted": {"$ne": True}
    })
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    # Extract all media URLs from the saved content
    referenced_urls = set()
    content_json = review.get("content_json")
    if content_json:
        _extract_media_urls_from_json(content_json, referenced_urls)

    # Extract just the object keys from the URLs
    endpoint = settings.minio_endpoint
    if not endpoint.startswith("http"):
        endpoint = f"http://{endpoint}"

    referenced_keys = {}  # bucket -> set of keys
    for url in referenced_urls:
        for bucket in [REVIEW_IMAGES_BUCKET, REVIEW_VIDEOS_BUCKET, REVIEW_MEDIA_BUCKET]:
            prefix = f"{endpoint}/{bucket}/"
            if url.startswith(prefix):
                key = url[len(prefix):]
                if bucket not in referenced_keys:
                    referenced_keys[bucket] = set()
                referenced_keys[bucket].add(key)

    # For each bucket, list objects for this manga and delete orphans
    deleted_count = 0
    minio = minio_service.client

    for bucket in [REVIEW_IMAGES_BUCKET, REVIEW_VIDEOS_BUCKET, REVIEW_MEDIA_BUCKET]:
        try:
            if not minio.bucket_exists(bucket):
                continue
            objects = minio.list_objects(bucket, prefix=f"{manga_id}/", recursive=True)
            bucket_refs = referenced_keys.get(bucket, set())
            
            for obj in objects:
                if obj.object_name not in bucket_refs:
                    try:
                        minio.remove_object(bucket, obj.object_name)
                        deleted_count += 1
                        logger.info(f"Cleaned orphaned object: {bucket}/{obj.object_name}")
                    except Exception as e:
                        logger.warning(f"Failed to delete orphan {bucket}/{obj.object_name}: {e}")
        except Exception as e:
            logger.warning(f"Error listing bucket {bucket}: {e}")

    # Update finalized timestamp
    await coll.update_one(
        {"_id": ObjectId(review_id)},
        {"$set": {"finalized_at": datetime.utcnow(), "updated_at": datetime.utcnow()}}
    )

    return {
        "status": "finalized",
        "deleted_orphans": deleted_count,
        "referenced_files": len(referenced_urls),
    }

