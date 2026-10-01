"""AI Router — endpoints for Gemini-powered review writing assistance."""

from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.database.connection import get_db
from backend.services.ai_service import call_gemini

router = APIRouter(prefix="/api/ai", tags=["AI"])


class AIRequest(BaseModel):
    manga_id: str
    mode: str  # "rewrite" | "intro" | "ideas"
    selected_text: Optional[str] = ""
    existing_review_json: Optional[Any] = None  # Tiptap JSON doc, will be converted to plain text
    rewrite_style: Optional[str] = None


def _tiptap_to_text(node: Any) -> str:
    """Recursively extract plain text from a Tiptap JSON document."""
    if not isinstance(node, dict):
        return ""
    if node.get("type") == "text":
        return node.get("text", "")
    parts = []
    for child in node.get("content", []):
        parts.append(_tiptap_to_text(child))
    return "\n".join(p for p in parts if p)


class AIPreviewResponse(BaseModel):
    prompt: str
    estimated_tokens: int
    mode: str


class AIResultResponse(BaseModel):
    result: str
    mode: str


@router.post("/preview", response_model=AIPreviewResponse)
async def preview_ai_request(req: AIRequest):
    """
    Preview the AI prompt and token estimate before sending.
    Used by the frontend confirmation modal.
    """
    if req.mode not in ("rewrite", "intro", "ideas"):
        raise HTTPException(status_code=400, detail="Invalid mode. Use: rewrite, intro, ideas")

    if req.mode == "rewrite" and not req.selected_text:
        raise HTTPException(status_code=400, detail="selected_text is required for rewrite mode")

    if not ObjectId.is_valid(req.manga_id):
        raise HTTPException(status_code=400, detail="Invalid manga ID")

    db = get_db()
    manga = await db.mangas.find_one({"_id": ObjectId(req.manga_id)})
    if not manga:
        raise HTTPException(status_code=404, detail="Manga not found")

    # Fetch tags for context
    tag_ids = manga.get("tag_ids", [])
    tags = []
    if tag_ids:
        cursor = db.tags.find({"_id": {"$in": [ObjectId(t) for t in tag_ids if ObjectId.is_valid(t)]}})
        async for tag in cursor:
            tags.append(tag)

    # Convert existing review JSON to text if provided
    existing_text = ""
    if req.existing_review_json:
        existing_text = _tiptap_to_text(req.existing_review_json)

    # Build preview (we call without actually calling Gemini)
    from backend.services.ai_service import _build_manga_context, _build_prompt, _estimate_tokens

    manga_context = _build_manga_context(dict(manga), tags)
    prompt = _build_prompt(req.mode, manga_context, req.selected_text or "", existing_text, req.rewrite_style or "")
    estimated_tokens = _estimate_tokens(prompt)

    return AIPreviewResponse(prompt=prompt, estimated_tokens=estimated_tokens, mode=req.mode)


@router.post("/generate", response_model=AIResultResponse)
async def generate_ai_content(req: AIRequest):
    """
    Actually call Gemini API and return the generated content.
    """
    if req.mode not in ("rewrite", "intro", "ideas"):
        raise HTTPException(status_code=400, detail="Invalid mode. Use: rewrite, intro, ideas")

    if req.mode == "rewrite" and not req.selected_text:
        raise HTTPException(status_code=400, detail="selected_text is required for rewrite mode")

    if not ObjectId.is_valid(req.manga_id):
        raise HTTPException(status_code=400, detail="Invalid manga ID")

    db = get_db()
    manga = await db.mangas.find_one({"_id": ObjectId(req.manga_id)})
    if not manga:
        raise HTTPException(status_code=404, detail="Manga not found")

    # Fetch tags
    tag_ids = manga.get("tag_ids", [])
    tags = []
    if tag_ids:
        cursor = db.tags.find({"_id": {"$in": [ObjectId(t) for t in tag_ids if ObjectId.is_valid(t)]}})
        async for tag in cursor:
            tags.append(tag)

    # Convert existing review JSON to text
    existing_text = ""
    if req.existing_review_json:
        existing_text = _tiptap_to_text(req.existing_review_json)

    try:
        ai_response = await call_gemini(
            mode=req.mode,
            manga=dict(manga),
            tags=tags,
            selected_text=req.selected_text or "",
            existing_review=existing_text,
            rewrite_style=req.rewrite_style or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return AIResultResponse(result=ai_response["result"], mode=req.mode)
