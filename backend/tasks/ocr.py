import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Union

from bson import ObjectId

from backend.core.redis import set_cache
from backend.database.connection import get_db
from backend.services.manga_ocr_service import manga_ocr_service
from backend.services.minio_service import minio_service
from backend.services.panel_scanner_service import panel_scanner_service
from backend.services.vision_service import vision_service

logger = logging.getLogger("tasks.ocr")


async def process_manga_panel_ocr(
    ctx: Any,
    panel_id: Union[int, str, None] = None,
    image_path: Optional[str] = None,
    language: str = "en",
) -> Dict[str, Any]:
    """
    Asynchronous task for processing manga panel image extraction and OCR.
    Supports invocation both as an ARQ job (ctx, panel_id, image_path)
    and as a direct function call (panel_id, image_path).

    Steps:
      1. Loads image bytes from local disk or MinIO object store.
      2. Performs OCR text detection using RapidOCR.
      3. Normalizes comic typography and handles punctuation / stuck-words.
      4. Extracts NLP lemmas and vocabulary tokens.
      5. Persists results to MongoDB if collection is reachable.
      6. Caches task result in Redis for rapid status queries.
    """
    # Handle polymorphic call signature (ARQ vs direct call)
    if isinstance(ctx, (int, str)) and panel_id is not None and image_path is None:
        actual_ctx: dict = {}
        actual_panel_id: Union[int, str] = ctx
        actual_image_path: str = str(panel_id)
    else:
        actual_ctx = ctx if isinstance(ctx, dict) else {}
        actual_panel_id = panel_id if panel_id is not None else 0
        actual_image_path = image_path or ""

    job_id = actual_ctx.get("job_id")
    logger.info(f"Starting OCR task (job_id={job_id}) for panel_id={actual_panel_id}, image={actual_image_path}")

    # Update in-progress state if job_id exists
    if job_id:
        await set_cache(
            f"task:ocr:{job_id}",
            {
                "task_id": job_id,
                "panel_id": str(actual_panel_id),
                "status": "in_progress",
                "image_path": actual_image_path,
                "started_at": datetime.now(timezone.utc).isoformat(),
            },
            ttl=3600,
        )

    # 1. Fetch image bytes from local disk or MinIO
    image_bytes = None
    if os.path.isfile(actual_image_path):
        try:
            with open(actual_image_path, "rb") as f:
                image_bytes = f.read()
        except Exception as e:
            logger.error(f"Failed to read image file from disk '{actual_image_path}': {e}")
            raise

    if image_bytes is None:
        # Fallback to MinIO object store
        try:
            resp = minio_service.client.get_object(minio_service.bucket, actual_image_path)
            try:
                image_bytes = resp.read()
            finally:
                resp.close()
                resp.release_conn()
        except Exception as e:
            err_msg = f"Failed to retrieve image from MinIO key '{actual_image_path}': {e}"
            logger.error(err_msg)
            if job_id:
                await set_cache(
                    f"task:ocr:{job_id}",
                    {
                        "task_id": job_id,
                        "panel_id": str(actual_panel_id),
                        "status": "failed",
                        "error": err_msg,
                        "failed_at": datetime.now(timezone.utc).isoformat(),
                    },
                    ttl=86400,
                )
            raise FileNotFoundError(err_msg) from e

    # 2. Decode image matrix
    img = vision_service.decode_image_bytes(image_bytes)
    if img is None:
        err_msg = f"Failed to decode image bytes for panel {actual_panel_id}"
        logger.error(err_msg)
        if job_id:
            await set_cache(
                f"task:ocr:{job_id}",
                {
                    "task_id": job_id,
                    "panel_id": str(actual_panel_id),
                    "status": "failed",
                    "error": err_msg,
                    "failed_at": datetime.now(timezone.utc).isoformat(),
                },
                ttl=86400,
            )
        raise ValueError(err_msg)

    # 3. Detect text boxes with RapidOCR
    detections = vision_service.detect_text(img)

    # 4. Post-process OCR detections via MangaOCRService
    ocr_result = manga_ocr_service.process_detections(detections, language=language)
    raw_text = ocr_result.get("raw_text", "")
    clean_text = ocr_result.get("clean_text", "")

    # 5. Extract NLP linguistic features
    lemmas, vocab_list = panel_scanner_service.extract_language_features(clean_text, language=language)

    # 6. Persist to MongoDB if available
    try:
        db = get_db()
    except Exception:
        db = None
    if db is not None:
        try:
            filter_id: Any
            if isinstance(actual_panel_id, str) and ObjectId.is_valid(actual_panel_id):
                filter_id = ObjectId(actual_panel_id)
            else:
                filter_id = actual_panel_id

            await db.manga_panels.update_one(
                {"_id": filter_id},
                {
                    "$set": {
                        "raw_text": raw_text,
                        "cleaned_text": clean_text,
                        "lemmas": lemmas,
                        "vocabulary": vocab_list,
                        "ocr_status": "completed",
                        "ocr_processed_at": datetime.now(timezone.utc),
                    }
                },
            )
        except Exception as db_err:
            logger.warning(f"Could not update MongoDB panel record {actual_panel_id}: {db_err}")

    # 7. Construct final result and update task cache in Redis
    result: Dict[str, Any] = {
        "task_id": job_id,
        "panel_id": str(actual_panel_id),
        "status": "completed",
        "image_path": actual_image_path,
        "raw_text": raw_text,
        "cleaned_text": clean_text,
        "lemmas": lemmas,
        "vocabulary": vocab_list,
        "detections_count": len(detections),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }

    if job_id:
        await set_cache(f"task:ocr:{job_id}", result, ttl=86400)

    logger.info(f"Finished OCR task for panel_id={actual_panel_id} with {len(detections)} detections.")
    return result
