"""Asynchronous background worker task for Translation Studio.

Consumes page slots from the dedicated queue 'arq:translation', executes the
subprocess runner, and coordinates MinIO artifacts and MongoDB results.
"""

import asyncio
import json
import logging
import os
import sys
import tempfile
import uuid
from datetime import timedelta
from typing import Any, Dict

from backend.database.connection import get_db
from backend.models.translation import (
    RegionData,
    TranslationPageBindingInDB,
    TranslationResultInDB,
    utc_now,
)
from backend.services.translation.storage_service import translation_storage_service

logger = logging.getLogger("translation_worker")


async def execute_translation_job_page(
    ctx: Dict[str, Any],
    job_id: str,
    page_identity: str,
    attempt: int = 1,
) -> Dict[str, Any]:
    """Claims a page slot, runs the isolated translation engine subprocess, and commits artifacts."""
    db = get_db()
    pages_col = db.translation_job_pages
    jobs_col = db.translation_jobs
    results_col = db.translation_results
    bindings_col = db.translation_page_bindings
    chapters_col = db.chapters

    # 1. CAS Lease Claim: increment fencing token and set lease
    now = utc_now()
    lease_expiration = now + timedelta(seconds=300)

    claim_res = await pages_col.update_one(
        {
            "job_id": job_id,
            "page_identity": page_identity,
            "state": {"$in": ["queued", "preparing"]},
        },
        {
            "$set": {
                "state": "running",
                "stage": "detection",
                "lease_until": lease_expiration,
            },
            "$inc": {"fencing_token": 1},
        },
    )

    if claim_res.matched_count == 0:
        logger.info(f"Page slot {job_id}/{page_identity} already claimed or in terminal state.")
        return {"status": "skipped_already_claimed"}

    # Fetch updated page slot to get fence token
    page_doc = await pages_col.find_one({"job_id": job_id, "page_identity": page_identity})
    fence_token = page_doc.get("fencing_token", 1) if page_doc else 1

    # Check job cancellation intent
    job_doc = await jobs_col.find_one({"job_id": job_id})
    if not job_doc or job_doc.get("cancel_requested"):
        await pages_col.update_one(
            {"job_id": job_id, "page_identity": page_identity},
            {"$set": {"state": "cancelled", "stage": None}},
        )
        return {"status": "cancelled"}

    # 2. Materialize input image
    source_manifest = job_doc.get("source_manifest", {})
    profile_snapshot = job_doc.get("profile_snapshot", {})
    target_language = profile_snapshot.get("target_language", "vi")
    chapter_id = source_manifest.get("chapter_id")

    with tempfile.TemporaryDirectory() as workdir:
        input_file = os.path.join(workdir, "source_input.png")

        # Fetch page object key from chapter
        if chapter_id:
            from bson import ObjectId

            c_key = {"_id": ObjectId(chapter_id)} if ObjectId.is_valid(chapter_id) else {"_id": chapter_id}
            chap = await chapters_col.find_one(c_key)
            if not chap:
                await pages_col.update_one(
                    {"job_id": job_id, "page_identity": page_identity},
                    {"$set": {"state": "failed", "error_code": "CHAPTER_NOT_FOUND"}},
                )
                return {"status": "failed", "error": "Chapter not found"}

            target_page = next((p for p in chap.get("pages", []) if p.get("page_uid") == page_identity), None)
            if not target_page:
                await pages_col.update_one(
                    {"job_id": job_id, "page_identity": page_identity},
                    {"$set": {"state": "failed", "error_code": "PAGE_NOT_FOUND"}},
                )
                return {"status": "failed", "error": "Page UID not found in chapter"}

            obj_key = target_page.get("object_key")
            try:
                img_data = await translation_storage_service.get_object_bytes(obj_key)
                with open(input_file, "wb") as f:
                    f.write(img_data)
            except Exception as e:
                logger.error(f"Failed to fetch image bytes from MinIO for {obj_key}: {e}")
                await pages_col.update_one(
                    {"job_id": job_id, "page_identity": page_identity},
                    {"$set": {"state": "failed", "error_code": "STORAGE_DOWNLOAD_FAILED", "error_message": str(e)}},
                )
                return {"status": "failed", "error": str(e)}
        else:
            # Fallback for synthetic/demo
            from PIL import Image

            Image.new("RGB", (600, 900), color=(255, 255, 255)).save(input_file)

        # 3. Construct input envelope
        envelope = {
            "protocol_version": 1,
            "job_id": job_id,
            "page_identity": page_identity,
            "attempt_id": f"att_{attempt}",
            "fencing_token": fence_token,
            "input": {"local_path": input_file, "sha256": "placeholder_sha"},
            "workdir": workdir,
            "profile_snapshot": {
                "schema_version": 1,
                "config_hash": "snapshot_hash",
                "effective_config": profile_snapshot,
            },
            "target_language": target_language,
            "operation_kind": "translate",
        }

        # 4. Invoke isolated subprocess
        runner_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../services/translator-runtime/adapter/runner.py")
        )

        cmd = [sys.executable, runner_path, "--envelope-stdin"]
        env_json = json.dumps(envelope)

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout_data, stderr_data = await proc.communicate(input=env_json.encode("utf-8"))

            if proc.returncode != 0:
                err_msg = stderr_data.decode("utf-8", errors="replace")
                logger.error(f"Runner subprocess failed: {err_msg}")
                await pages_col.update_one(
                    {"job_id": job_id, "page_identity": page_identity},
                    {"$set": {"state": "failed", "error_code": "RUNNER_CRASH", "error_message": err_msg[:500]}},
                )
                return {"status": "failed", "error": err_msg}

            # Parse stdout
            manifest = None
            for line in stdout_data.decode("utf-8", errors="replace").splitlines():
                if line.startswith("EVENT:"):
                    raw_ev = line[len("EVENT:") :]
                    try:
                        ev = json.loads(raw_ev)
                        await pages_col.update_one(
                            {"job_id": job_id, "page_identity": page_identity},
                            {"$set": {"stage": ev.get("stage")}},
                        )
                    except Exception:
                        pass
                elif line.startswith("MANIFEST:"):
                    manifest = json.loads(line[len("MANIFEST:") :])

            if not manifest or not manifest.get("success"):
                err_code = manifest.get("error_code", "MANIFEST_ERROR") if manifest else "NO_MANIFEST"
                await pages_col.update_one(
                    {"job_id": job_id, "page_identity": page_identity},
                    {"$set": {"state": "failed", "error_code": err_code}},
                )
                return {"status": "failed", "error": err_code}

            # 5. Commit artifacts to MinIO
            out_img = manifest.get("output_image_path")
            clean_img = manifest.get("clean_image_path")

            dest_out_key = f"translation/local/results/{job_id}/{page_identity}/translated.png"
            dest_clean_key = f"translation/local/results/{job_id}/{page_identity}/cleaned.png"

            with open(out_img, "rb") as f_out:
                await translation_storage_service.upload_file(dest_out_key, f_out.read(), content_type="image/png")

            if clean_img and os.path.exists(clean_img):
                with open(clean_img, "rb") as f_clean:
                    await translation_storage_service.upload_file(
                        dest_clean_key, f_clean.read(), content_type="image/png"
                    )

            # 6. Save Translation Result
            result_id = f"res_{uuid.uuid4().hex[:16]}"
            result_doc = TranslationResultInDB(
                result_id=result_id,
                scope="local",
                fingerprint=manifest.get("output_sha256", "sha_placeholder"),
                source_sha256="src_sha_placeholder",
                chapter_id=chapter_id,
                page_uid=page_identity,
                target_language=target_language,
                active_revision=1,
                output_object_key=dest_out_key,
                clean_object_key=dest_clean_key,
                width=manifest.get("width", 800),
                height=manifest.get("height", 1200),
                regions=[
                    RegionData(
                        region_id=r.get("region_id", "reg"),
                        bounding_box=r.get("bounding_box", {}),
                        reading_order=r.get("reading_order", 1),
                        source_text=r.get("source_text", ""),
                        translated_text=r.get("translated_text", ""),
                        confidence=r.get("confidence"),
                    )
                    for r in manifest.get("regions", [])
                ],
                created_at=utc_now(),
            )
            await results_col.insert_one(result_doc.model_dump(by_alias=True))

            # 7. Update Page Binding
            binding_doc = TranslationPageBindingInDB(
                scope="local",
                chapter_id=chapter_id or "demo",
                page_uid=page_identity,
                target_language=target_language,
                chosen_result_id=result_id,
                chosen_revision=1,
                validated_source_hash=manifest.get("output_sha256", ""),
                updated_at=utc_now(),
            )
            await bindings_col.update_one(
                {
                    "scope": "local",
                    "chapter_id": chapter_id or "demo",
                    "page_uid": page_identity,
                    "target_language": target_language,
                },
                {"$set": binding_doc.model_dump(by_alias=True)},
                upsert=True,
            )

            # 8. Mark page completed with fencing validation
            await pages_col.update_one(
                {
                    "job_id": job_id,
                    "page_identity": page_identity,
                    "fencing_token": fence_token,
                },
                {"$set": {"state": "completed", "result_id": result_id, "stage": "completed"}},
            )

            return {"status": "completed", "result_id": result_id}

        except Exception as ex:
            logger.error(f"Unexpected error executing page {job_id}/{page_identity}: {ex}", exc_info=True)
            await pages_col.update_one(
                {"job_id": job_id, "page_identity": page_identity},
                {"$set": {"state": "failed", "error_code": "WORKER_EXCEPTION", "error_message": str(ex)}},
            )
            return {"status": "failed", "error": str(ex)}
