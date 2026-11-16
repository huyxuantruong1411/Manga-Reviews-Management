"""Lossless MinIO Storage Optimizer with Two-Phase Commit, Backup & Rollback.

Implements the production-safe lossless optimization pipeline derived from
``ref/optimize/Tối Ưu Lưu Trữ Manga MinIO.md`` while preserving 100% browser
and service compatibility (Reader, Cover Art Gallery, Data Lake Pool, Vision/OCR,
Chapter Export, and Tierlist Maker).

All generated backups, journals, and temporary files reside strictly on Drive D
(default: ``d:\\Projects\\Manga\\backups\\storage_optimization``).
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Force all temporary files onto Drive D before any library imports
_DEFAULT_TMP = Path(r"d:\Projects\Manga\Manga-Reviews-Management\.tmp")
_DEFAULT_TMP.mkdir(parents=True, exist_ok=True)
os.environ["TEMP"] = str(_DEFAULT_TMP)
os.environ["TMP"] = str(_DEFAULT_TMP)
tempfile.tempdir = str(_DEFAULT_TMP)

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from bson import ObjectId  # noqa: E402
from PIL import Image  # noqa: E402
from pymongo import MongoClient  # noqa: E402

from backend.config import settings  # noqa: E402
from backend.services.minio_service import minio_service  # noqa: E402
from backend.utils.mgtile_container import (  # noqa: E402
    PNG_SIGNATURE,
    inspect_png_ihdr,
    optimize_png_bytes_to_webp_lossless,
)
from scripts.backup_metadata import backup as run_mongo_backup  # noqa: E402
from scripts.backup_metadata import restore_drill  # noqa: E402

DEFAULT_BACKUP_DIR = Path(r"d:\Projects\Manga\backups\storage_optimization")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _put_minio_bytes(key: str, data: bytes, content_type: str) -> None:
    minio_service.client.put_object(
        minio_service.bucket,
        key,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )


def _append_journal(backup_dir: Path, entry: dict[str, Any]) -> None:
    backup_dir.mkdir(parents=True, exist_ok=True)
    journal_path = backup_dir / "rollback_journal.jsonl"
    entry_with_ts = {"timestamp": _utc_now_iso(), **entry}
    with journal_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry_with_ts, ensure_ascii=False) + "\n")


def _worker_optimize_png_task(
    args: tuple[str, bytes, int, int, int, float],
) -> tuple[str, bytes | None, int, int, str, str | None, int]:
    """Worker function for ProcessPoolExecutor.

    Returns (key, webp_bytes_or_None, orig_size, new_size, orig_sha256, new_sha256, color_type).
    """
    key, raw_bytes, method, quality, min_savings_bytes, min_savings_ratio = args
    orig_size = len(raw_bytes)
    orig_sha = hashlib.sha256(raw_bytes).hexdigest()
    ihdr = inspect_png_ihdr(raw_bytes)
    ct = ihdr["color_type"] if ihdr else -1

    webp_bytes, changed = optimize_png_bytes_to_webp_lossless(
        raw_bytes,
        method=method,
        quality=quality,
        verify_pixels=True,
        min_savings_bytes=min_savings_bytes,
        min_savings_ratio=min_savings_ratio,
    )
    if not changed:
        return key, None, orig_size, orig_size, orig_sha, None, ct
    new_sha = hashlib.sha256(webp_bytes).hexdigest()
    return key, webp_bytes, orig_size, len(webp_bytes), orig_sha, new_sha, ct


def _measure_minio_data_disk_bytes() -> dict[str, int]:
    minio_data_dir = ROOT_DIR / "backend" / "minio_data"
    total_bytes = 0
    file_count = 0
    for root, _dirs, files in os.walk(minio_data_dir):
        for fn in files:
            fp = os.path.join(root, fn)
            try:
                total_bytes += os.path.getsize(fp)
                file_count += 1
            except OSError:
                pass
    return {"total_bytes": total_bytes, "file_count": file_count}


def _collect_all_referenced_keys(mc: MongoClient) -> set[str]:
    db = mc[settings.database_name]
    pool_db = mc[settings.pool_database_name]
    ref_keys: set[str] = set()

    for m in db.mangas.find({}, {"minio_cover_key": 1}):
        if m.get("minio_cover_key"):
            ref_keys.add(m["minio_cover_key"])

    for c in db.cover_arts.find({}, {"minio_key": 1}):
        if c.get("minio_key"):
            ref_keys.add(c["minio_key"])

    for c in db.chapters.find({}, {"manga_id": 1, "pages.object_key": 1, "active_revision": 1}):
        mid = str(c.get("manga_id", ""))
        cid = str(c.get("_id", ""))
        rev = c.get("active_revision")
        if mid and cid and rev:
            ref_keys.add(f"chapters/{mid}/{cid}/revisions/{rev}/manifest.json")
        for p in c.get("pages", []):
            if p.get("object_key"):
                ref_keys.add(p["object_key"])

    for r in db.chapter_revisions.find({}, {"manifest_key": 1, "pages.object_key": 1}):
        if r.get("manifest_key"):
            ref_keys.add(r["manifest_key"])
        for p in r.get("pages", []):
            if p.get("object_key"):
                ref_keys.add(p["object_key"])

    for p in db.manga_panels.find({}, {"minio_key": 1, "page_minio_key": 1}):
        if p.get("minio_key"):
            ref_keys.add(p["minio_key"])
        if p.get("page_minio_key"):
            ref_keys.add(p["page_minio_key"])

    for p in db.panel_scan_pages.find({}, {"object_key": 1}):
        if p.get("object_key"):
            ref_keys.add(p["object_key"])

    for rev in db.reviews.find({}, {"media_attachments": 1}):
        for att in rev.get("media_attachments") or []:
            if isinstance(att, dict) and att.get("minio_key"):
                ref_keys.add(att["minio_key"])

    for tl in db.creator_tierlists.find({}, {"tiers.items.selected_minio_key": 1}):
        for row in tl.get("tiers") or []:
            for item in row.get("items") or []:
                if item.get("selected_minio_key"):
                    ref_keys.add(item["selected_minio_key"])

    for tp in db.translation_job_pages.find({}, {"output_key": 1, "clean_key": 1, "mask_key": 1, "source_key": 1}):
        for f in ("output_key", "clean_key", "mask_key", "source_key"):
            if tp.get(f):
                ref_keys.add(tp[f])

    # Pool DB references
    for pm in pool_db.pool_mangas.find({}, {"primary_cover": 1, "cover_arts": 1}):
        pc = pm.get("primary_cover")
        if isinstance(pc, dict) and pc.get("object_key"):
            ref_keys.add(pc["object_key"])
        for ca in pm.get("cover_arts") or []:
            if isinstance(ca, dict) and ca.get("object_key"):
                ref_keys.add(ca["object_key"])

    for pc in pool_db.pool_chapters.find({}, {"pages.object_key": 1, "manifest_key": 1}):
        if pc.get("manifest_key"):
            ref_keys.add(pc["manifest_key"])
        for p in pc.get("pages") or []:
            if isinstance(p, dict) and p.get("object_key"):
                ref_keys.add(p["object_key"])

    return ref_keys


def step_backup(mc: MongoClient, backup_dir: Path) -> dict[str, Any]:
    """Step 1: Full BSON + JSON backup with restore drill for manga_library and manga_datalake_pool."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    mongo_backup_root = backup_dir / "mongodb_backup" / ts
    lib_dir = mongo_backup_root / settings.database_name
    pool_dir = mongo_backup_root / settings.pool_database_name
    print(f"[1/5] Backing up MongoDB databases to {mongo_backup_root} ...")

    run_mongo_backup(mc[settings.database_name], lib_dir, writers_paused=True)
    restore_drill(mc, lib_dir)

    run_mongo_backup(mc[settings.pool_database_name], pool_dir, writers_paused=True)
    restore_drill(mc, pool_dir)

    disk_stats = _measure_minio_data_disk_bytes()
    baseline = {
        "created_at": _utc_now_iso(),
        "disk_before": disk_stats,
        "manga_library_backup": str(lib_dir),
        "manga_datalake_pool_backup": str(pool_dir),
    }
    baseline_path = backup_dir / "baseline_snapshot.json"
    if not baseline_path.exists():
        baseline_path.write_text(json.dumps(baseline, indent=2), encoding="utf-8")
    print(
        f"  -> MongoDB backups verified (restore_drill=True). "
        f"Physical MinIO disk: {disk_stats['total_bytes'] / (1024**2):.2f} MB ({disk_stats['file_count']} files)."
    )
    return baseline


def step_clean_orphans(mc: MongoClient, backup_dir: Path) -> dict[str, Any]:
    """Step 2: Archive unreferenced MinIO objects to Drive D and remove from MinIO."""
    print("[2/5] Scanning for orphaned MinIO objects ...")
    ref_keys = _collect_all_referenced_keys(mc)
    orphans_root = backup_dir / "orphans_backup"
    orphans_root.mkdir(parents=True, exist_ok=True)

    orphan_objs = []
    for obj in minio_service.client.list_objects(minio_service.bucket, recursive=True):
        if obj.is_dir:
            continue
        key = obj.object_name
        # Keep translation fonts/assets and chapter revision manifests
        if key.startswith("translation/") or key.endswith("/manifest.json"):
            continue
        if key not in ref_keys:
            orphan_objs.append((key, obj.size))

    print(f"  -> Found {len(orphan_objs)} orphaned objects ({sum(s for _, s in orphan_objs) / (1024**2):.2f} MB).")
    removed_count = 0
    removed_bytes = 0

    for key, _sz in orphan_objs:
        raw_bytes, content_type = minio_service.get_object_stream(key)
        sha = _sha256(raw_bytes)
        dest_file = orphans_root / key.replace("/", os.sep)
        dest_file.parent.mkdir(parents=True, exist_ok=True)
        dest_file.write_bytes(raw_bytes)

        # Verify written backup matches SHA-256
        if _sha256(dest_file.read_bytes()) != sha:
            raise RuntimeError(f"Orphan backup checksum mismatch for {key}")

        meta_file = dest_file.with_suffix(dest_file.suffix + ".meta.json")
        meta_file.write_text(
            json.dumps(
                {
                    "key": key,
                    "size": len(raw_bytes),
                    "sha256": sha,
                    "content_type": content_type,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        _append_journal(
            backup_dir,
            {
                "action": "delete_orphan",
                "key": key,
                "backup_file": str(dest_file),
                "size": len(raw_bytes),
                "sha256": sha,
                "content_type": content_type,
            },
        )
        minio_service.client.remove_object(minio_service.bucket, key)
        removed_count += 1
        removed_bytes += len(raw_bytes)

    print(f"  -> Backed up and removed {removed_count} orphaned objects ({removed_bytes / (1024**2):.2f} MB saved).")
    return {"removed_count": removed_count, "removed_bytes": removed_bytes}


def step_dedup_primary_covers(mc: MongoClient, backup_dir: Path) -> dict[str, Any]:
    """Step 3: Deduplicate covers/{manga_id}.jpg when 100% byte-identical to a cover-arts/ object."""
    print("[3/5] Deduplicating byte-identical primary covers (covers/ -> cover-arts/) ...")
    db = mc[settings.database_name]
    pool_db = mc[settings.pool_database_name]

    # Build size map of all MinIO objects under covers/ and cover-arts/ for fast pre-filtering
    size_map: dict[str, int] = {}
    for prefix in ("covers/", "cover-arts/"):
        for obj in minio_service.client.list_objects(minio_service.bucket, prefix=prefix, recursive=True):
            if not obj.is_dir:
                size_map[obj.object_name] = obj.size

    mangas = list(
        db.mangas.find(
            {"minio_cover_key": {"$regex": r"^covers/"}},
            {"_id": 1, "minio_cover_key": 1, "mangadex_id": 1},
        )
    )
    print(f"  -> Checking {len(mangas)} mangas with 'covers/{{id}}.jpg' primary cover keys ...")

    deduped_count = 0
    saved_bytes = 0

    for idx, m in enumerate(mangas, 1):
        mid_str = str(m["_id"])
        old_key = m["minio_cover_key"]
        old_size = size_map.get(old_key)
        if old_size is None:
            continue

        # Find candidate cover_arts for this manga that have the exact same byte size
        ca_docs = list(db.cover_arts.find({"manga_id": mid_str}, {"minio_key": 1}))
        same_size_keys = [
            ca["minio_key"]
            for ca in ca_docs
            if ca.get("minio_key") and ca["minio_key"] != old_key and size_map.get(ca["minio_key"]) == old_size
        ]
        if not same_size_keys:
            continue

        old_bytes, old_ct = minio_service.get_object_stream(old_key)
        old_sha = _sha256(old_bytes)

        matched_new_key: str | None = None
        for cand_key in same_size_keys:
            cand_bytes, _ = minio_service.get_object_stream(cand_key)
            if len(cand_bytes) == len(old_bytes) and _sha256(cand_bytes) == old_sha:
                matched_new_key = cand_key
                break

        if not matched_new_key:
            continue

        # Track pool_mangas and tierlists referencing old_key
        pool_matches = [
            str(pm["_id"]) for pm in pool_db.pool_mangas.find({"primary_cover.object_key": old_key}, {"_id": 1})
        ]
        tierlist_matches = [
            str(tl["_id"]) for tl in db.creator_tierlists.find({"tiers.items.selected_minio_key": old_key}, {"_id": 1})
        ]

        # Update MongoDB pointers first
        db.mangas.update_one({"_id": m["_id"]}, {"$set": {"minio_cover_key": matched_new_key}})
        if pool_matches:
            pool_db.pool_mangas.update_many(
                {"primary_cover.object_key": old_key},
                {"$set": {"primary_cover.object_key": matched_new_key}},
            )
        if tierlist_matches:
            for tl_id in tierlist_matches:
                tl_doc = db.creator_tierlists.find_one({"_id": ObjectId(tl_id)})
                if not tl_doc:
                    continue
                tiers = tl_doc.get("tiers") or []
                for row in tiers:
                    for item in row.get("items") or []:
                        if item.get("selected_minio_key") == old_key:
                            item["selected_minio_key"] = matched_new_key
                db.creator_tierlists.update_one({"_id": ObjectId(tl_id)}, {"$set": {"tiers": tiers}})

        _append_journal(
            backup_dir,
            {
                "action": "dedup_primary_cover",
                "manga_id": mid_str,
                "old_key": old_key,
                "new_key": matched_new_key,
                "size": len(old_bytes),
                "sha256": old_sha,
                "content_type": old_ct,
                "pool_manga_ids": pool_matches,
                "tierlist_ids": tierlist_matches,
            },
        )

        # Remove redundant covers/{manga_id}.jpg from MinIO
        minio_service.client.remove_object(minio_service.bucket, old_key)
        deduped_count += 1
        saved_bytes += len(old_bytes)

        if deduped_count % 500 == 0:
            print(
                f"     [{idx}/{len(mangas)}] Deduplicated {deduped_count} primary covers "
                f"({saved_bytes / (1024**2):.2f} MB saved) ..."
            )

    print(f"  -> Deduplicated {deduped_count} byte-identical primary covers ({saved_bytes / (1024**2):.2f} MB saved).")
    return {"deduped_count": deduped_count, "saved_bytes": saved_bytes}


def _check_is_png_header(key: str) -> str | None:
    try:
        resp = minio_service.client.get_object(minio_service.bucket, key, offset=0, length=16)
        hdr = resp.read()
        resp.close()
        resp.release_conn()
        if len(hdr) >= 8 and hdr[:8] == PNG_SIGNATURE:
            return key
    except Exception:
        pass
    return None


def step_optimize_png_covers(
    mc: MongoClient,
    backup_dir: Path,
    *,
    workers: int = 16,
    method: int = 4,
    quality: int = 75,
) -> dict[str, Any]:
    """Step 4: Losslessly convert PNG objects in cover-arts/ and covers/ to WebP Lossless (VP8L)."""
    print("[4/5] Scanning cover-arts/ and covers/ for PNG files ...")
    pool_db = mc[settings.pool_database_name]

    cover_keys: list[str] = []
    for prefix in ("cover-arts/", "covers/"):
        for obj in minio_service.client.list_objects(minio_service.bucket, prefix=prefix, recursive=True):
            if not obj.is_dir:
                cover_keys.append(obj.object_name)

    png_cover_keys: list[str] = []
    with ThreadPoolExecutor(max_workers=16) as tex:
        for res in tex.map(_check_is_png_header, cover_keys):
            if res is not None:
                png_cover_keys.append(res)

    print(f"  -> Found {len(png_cover_keys)} PNG cover files out of {len(cover_keys)} total cover objects.")
    if not png_cover_keys:
        return {"converted_count": 0, "saved_bytes": 0}

    converted_count = 0
    saved_bytes = 0
    batch_size = 64

    with ProcessPoolExecutor(max_workers=workers) as pex:
        for b_start in range(0, len(png_cover_keys), batch_size):
            batch_keys = png_cover_keys[b_start : b_start + batch_size]

            # Download batch concurrently
            def _fetch(k: str) -> tuple[str, bytes]:
                raw, _ = minio_service.get_object_stream(k)
                return k, raw

            with ThreadPoolExecutor(max_workers=16) as tex:
                fetched = list(tex.map(_fetch, batch_keys))

            tasks = [(k, raw, method, quality, 4096, 0.02) for k, raw in fetched]
            batch_results = [
                r
                for r in pex.map(_worker_optimize_png_task, tasks, chunksize=2)
                if r[1] is not None and r[5] is not None
            ]

            def _upload_cover_webp(
                item: tuple[str, bytes | None, int, int, str, str | None, int],
            ) -> tuple[str, int, int, str, str, int]:
                k, wb_bytes, orig_sz, new_sz, orig_sha, new_sha, ct = item
                assert wb_bytes is not None and new_sha is not None
                _put_minio_bytes(k, wb_bytes, content_type="image/webp")
                return k, orig_sz, new_sz, orig_sha, new_sha, ct

            with ThreadPoolExecutor(max_workers=16) as tex:
                uploaded_covers = list(tex.map(_upload_cover_webp, batch_results))

            for key, orig_sz, new_sz, orig_sha, new_sha, ct in uploaded_covers:
                # Update pool_mangas metadata if present
                pool_db.pool_mangas.update_many(
                    {"primary_cover.object_key": key},
                    {
                        "$set": {
                            "primary_cover.file_size": new_sz,
                            "primary_cover.content_type": "image/webp",
                        }
                    },
                )
                pool_db.pool_mangas.update_many(
                    {"cover_arts.object_key": key},
                    {
                        "$set": {
                            "cover_arts.$[elem].file_size": new_sz,
                            "cover_arts.$[elem].content_type": "image/webp",
                        }
                    },
                    array_filters=[{"elem.object_key": key}],
                )

                _append_journal(
                    backup_dir,
                    {
                        "action": "optimize_png_cover",
                        "key": key,
                        "orig_size": orig_sz,
                        "new_size": new_sz,
                        "orig_sha256": orig_sha,
                        "new_sha256": new_sha,
                        "color_type": ct,
                    },
                )
                converted_count += 1
                saved_bytes += orig_sz - new_sz

            print(
                f"     [{min(b_start + batch_size, len(png_cover_keys))}/{len(png_cover_keys)}] "
                f"Converted {converted_count} PNG covers ({saved_bytes / (1024**2):.2f} MB saved) ..."
            )

    print(f"  -> Converted {converted_count} PNG covers to WebP Lossless ({saved_bytes / (1024**2):.2f} MB saved).")
    return {"converted_count": converted_count, "saved_bytes": saved_bytes}


def _update_chapter_manifest_in_minio(
    manga_id: str,
    chapter_id: str,
    active_revision: int | None,
    key_map: dict[str, tuple[str, int]],
) -> str | None:
    if not active_revision:
        return None
    manifest_key = f"chapters/{manga_id}/{chapter_id}/revisions/{active_revision}/manifest.json"
    if not minio_service.object_exists(manifest_key):
        return None
    try:
        raw_manifest, _ = minio_service.get_object_stream(manifest_key)
        manifest = json.loads(raw_manifest.decode("utf-8"))
        changed = False
        for p in manifest.get("pages") or []:
            old_k = p.get("object_key")
            if old_k and old_k in key_map:
                new_k, new_sz = key_map[old_k]
                p["object_key"] = new_k
                p["file_size"] = new_sz
                p["content_type"] = "image/webp"
                if isinstance(p.get("filename"), str) and p["filename"].lower().endswith(".png"):
                    p["filename"] = p["filename"][:-4] + ".webp"
                changed = True
        if changed:
            manifest["file_size"] = sum(p.get("file_size", 0) for p in manifest.get("pages") or [])
            _put_minio_bytes(
                manifest_key,
                json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
                content_type="application/json",
            )
            return manifest_key
    except Exception as e:
        print(f"     [WARN] Could not update manifest {manifest_key}: {e}")
    return None


def step_optimize_png_chapters(
    mc: MongoClient,
    backup_dir: Path,
    *,
    workers: int = 16,
    color_mode: str = "all",
) -> dict[str, Any]:
    """Step 5: Convert PNG chapter pages to WebP Lossless using Two-Phase Commit per chapter."""
    print(f"[5/5] Optimizing PNG chapter pages (color_mode={color_mode}, workers={workers}) ...")
    db = mc[settings.database_name]
    pool_db = mc[settings.pool_database_name]

    chapters = list(db.chapters.find({"pages.object_key": {"$regex": r"\.png$"}}))
    print(f"  -> Found {len(chapters)} chapters in manga_library containing .png pages.")

    total_chapters_updated = 0
    total_pages_converted = 0
    total_saved_bytes = 0
    affected_pool_manga_ids: set[str] = set()
    t_start = time.perf_counter()

    with ProcessPoolExecutor(max_workers=workers) as pex:
        for c_idx, chap in enumerate(chapters, 1):
            cid_obj = chap["_id"]
            cid_str = str(cid_obj)
            mid_str = str(chap.get("manga_id", ""))
            pages = chap.get("pages") or []
            png_pages = [p for p in pages if str(p.get("object_key", "")).endswith(".png")]
            if not png_pages:
                continue

            # If color_mode == "truecolor", check first & middle page IHDR via 32-byte range request
            if color_mode == "truecolor":
                sample_p = png_pages[len(png_pages) // 2]
                resp = minio_service.client.get_object(
                    minio_service.bucket, sample_p["object_key"], offset=0, length=32
                )
                hdr = resp.read()
                resp.close()
                resp.release_conn()
                ihdr = inspect_png_ihdr(hdr)
                first_resp = minio_service.client.get_object(
                    minio_service.bucket, png_pages[0]["object_key"], offset=0, length=32
                )
                first_hdr = first_resp.read()
                first_resp.close()
                first_resp.release_conn()
                first_ihdr = inspect_png_ihdr(first_hdr)
                ct_mid = ihdr["color_type"] if ihdr else -1
                ct_first = first_ihdr["color_type"] if first_ihdr else -1
                if ct_mid not in (2, 4, 6) and ct_first not in (2, 4, 6):
                    continue

            # Download chapter PNG pages concurrently
            def _fetch_page(p_dict: dict[str, Any]) -> tuple[str, bytes]:
                k = p_dict["object_key"]
                raw, _ = minio_service.get_object_stream(k)
                return k, raw

            with ThreadPoolExecutor(max_workers=16) as tex:
                fetched_pages = list(tex.map(_fetch_page, png_pages))

            tasks = []
            for k, raw in fetched_pages:
                ihdr = inspect_png_ihdr(raw)
                ct = ihdr["color_type"] if ihdr else -1
                if color_mode == "truecolor" and ct not in (2, 4, 6):
                    continue
                # Adaptive method: Truecolor RGB/RGBA uses method=4, Grayscale/Palette uses method=2
                m = 4 if ct in (2, 4, 6) else 2
                tasks.append((k, raw, m, 75, 4096, 0.02))

            if not tasks:
                continue

            results = list(pex.map(_worker_optimize_png_task, tasks, chunksize=2))
            converted_items = [r for r in results if r[1] is not None and r[5] is not None]
            if not converted_items:
                continue

            # Phase A (2PC): Upload all new .webp objects to MinIO first
            key_map: dict[str, tuple[str, int]] = {}
            journal_pages: list[dict[str, Any]] = []

            def _upload_webp(
                item: tuple[str, bytes | None, int, int, str, str | None, int],
            ) -> tuple[str, str, int, int, str, str, int]:
                old_k, wb_bytes, orig_sz, new_sz, orig_sha, new_sha, ct = item
                assert wb_bytes is not None and new_sha is not None
                new_k = old_k[:-4] + ".webp"
                _put_minio_bytes(new_k, wb_bytes, content_type="image/webp")
                return old_k, new_k, orig_sz, new_sz, orig_sha, new_sha, ct

            with ThreadPoolExecutor(max_workers=16) as tex:
                uploaded_list = list(tex.map(_upload_webp, converted_items))

            for old_k, new_k, orig_sz, new_sz, orig_sha, new_sha, ct in uploaded_list:
                key_map[old_k] = (new_k, new_sz)
                journal_pages.append(
                    {
                        "old_key": old_k,
                        "new_key": new_k,
                        "orig_size": orig_sz,
                        "new_size": new_sz,
                        "orig_sha256": orig_sha,
                        "new_sha256": new_sha,
                        "color_type": ct,
                    }
                )

            # Phase B (2PC): Update MongoDB documents & MinIO manifest.json
            for p in pages:
                ok = p.get("object_key")
                if ok in key_map:
                    nk, nsz = key_map[ok]
                    p["object_key"] = nk
                    p["file_size"] = nsz
                    p["content_type"] = "image/webp"
                    if isinstance(p.get("filename"), str) and p["filename"].lower().endswith(".png"):
                        p["filename"] = p["filename"][:-4] + ".webp"

            new_chap_size = sum(p.get("file_size", 0) for p in pages)
            db.chapters.update_one(
                {"_id": cid_obj},
                {"$set": {"pages": pages, "file_size": new_chap_size, "updated_at": datetime.now(timezone.utc)}},
            )

            # Update chapter_revisions if present
            for rev_doc in db.chapter_revisions.find({"chapter_id": cid_str}):
                r_pages = rev_doc.get("pages") or []
                r_changed = False
                for p in r_pages:
                    ok = p.get("object_key")
                    if ok in key_map:
                        nk, nsz = key_map[ok]
                        p["object_key"] = nk
                        p["file_size"] = nsz
                        p["content_type"] = "image/webp"
                        r_changed = True
                if r_changed:
                    db.chapter_revisions.update_one(
                        {"_id": rev_doc["_id"]},
                        {"$set": {"pages": r_pages, "file_size": sum(p.get("file_size", 0) for p in r_pages)}},
                    )

            # Update manga_panels and panel_scan_pages if any exist for this chapter
            for old_k, (new_k, _nsz) in key_map.items():
                db.manga_panels.update_many(
                    {"chapter_id": cid_str, "page_minio_key": old_k},
                    {"$set": {"page_minio_key": new_k}},
                )
                db.panel_scan_pages.update_many(
                    {"chapter_id": cid_str, "object_key": old_k},
                    {"$set": {"object_key": new_k}},
                )

            # Update pool_db.pool_chapters if linked
            sha_by_old_key = {jp["old_key"]: jp["new_sha256"] for jp in journal_pages}
            for pc_doc in pool_db.pool_chapters.find({"pages.object_key": {"$in": list(key_map.keys())}}):
                pc_pages = pc_doc.get("pages") or []
                for p in pc_pages:
                    ok = p.get("object_key")
                    if ok in key_map:
                        nk, nsz = key_map[ok]
                        p["object_key"] = nk
                        p["file_size"] = nsz
                        p["content_type"] = "image/webp"
                        if ok in sha_by_old_key:
                            p["sha256"] = sha_by_old_key[ok]
                new_pc_size = sum(p.get("file_size", 0) for p in pc_pages)
                new_hashes = [p.get("sha256", "") for p in pc_pages if p.get("sha256")]
                pool_db.pool_chapters.update_one(
                    {"_id": pc_doc["_id"]},
                    {
                        "$set": {
                            "pages": pc_pages,
                            "file_size": new_pc_size,
                            "page_hashes": new_hashes,
                        }
                    },
                )
                if pc_doc.get("pool_manga_id"):
                    affected_pool_manga_ids.add(str(pc_doc["pool_manga_id"]))

            manifest_updated = _update_chapter_manifest_in_minio(mid_str, cid_str, chap.get("active_revision"), key_map)

            # Phase C (2PC): Log to rollback journal and remove old .png keys from MinIO
            _append_journal(
                backup_dir,
                {
                    "action": "optimize_chapter_pages",
                    "chapter_id": cid_str,
                    "manga_id": mid_str,
                    "active_revision": chap.get("active_revision"),
                    "manifest_key": manifest_updated,
                    "pages": journal_pages,
                },
            )

            with ThreadPoolExecutor(max_workers=16) as tex:
                list(
                    tex.map(
                        lambda ok: minio_service.client.remove_object(minio_service.bucket, ok),
                        key_map.keys(),
                    )
                )

            chap_saved = sum(jp["orig_size"] - jp["new_size"] for jp in journal_pages)
            total_chapters_updated += 1
            total_pages_converted += len(journal_pages)
            total_saved_bytes += chap_saved

            if total_chapters_updated % 25 == 0 or c_idx == len(chapters):
                elapsed = time.perf_counter() - t_start
                print(
                    f"     [{c_idx}/{len(chapters)}] Updated {total_chapters_updated} chapters, "
                    f"{total_pages_converted} pages ({total_saved_bytes / (1024**2):.2f} MB saved, "
                    f"{elapsed:.1f}s elapsed) ..."
                )

    # Recompute stats.total_size_bytes for affected pool_mangas
    for pm_id in affected_pool_manga_ids:
        tot_pool_bytes = sum(
            c.get("file_size", 0) for c in pool_db.pool_chapters.find({"pool_manga_id": pm_id}, {"file_size": 1})
        )
        pool_db.pool_mangas.update_one(
            {"pool_manga_id": pm_id},
            {"$set": {"stats.total_size_bytes": tot_pool_bytes}},
        )

    print(
        f"  -> Converted {total_pages_converted} PNG pages across {total_chapters_updated} chapters "
        f"({total_saved_bytes / (1024**2):.2f} MB saved)."
    )
    return {
        "chapters_updated": total_chapters_updated,
        "pages_converted": total_pages_converted,
        "saved_bytes": total_saved_bytes,
    }


def step_rollback(mc: MongoClient, backup_dir: Path, *, limit: int | None = None) -> dict[str, Any]:
    """Reverse operations recorded in rollback_journal.jsonl in LIFO order."""
    journal_path = backup_dir / "rollback_journal.jsonl"
    if not journal_path.exists():
        print(f"No rollback journal found at {journal_path}")
        return {"rolled_back": 0}

    lines = [ln.strip() for ln in journal_path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    entries = [json.loads(ln) for ln in lines]
    if limit is not None and limit > 0:
        to_revert = list(reversed(entries[-limit:]))
        remaining = entries[:-limit]
    else:
        to_revert = list(reversed(entries))
        remaining = []

    db = mc[settings.database_name]
    pool_db = mc[settings.pool_database_name]
    reverted = 0

    for entry in to_revert:
        act = entry.get("action")
        if act == "delete_orphan":
            key = entry["key"]
            bfile = Path(entry["backup_file"])
            raw = bfile.read_bytes()
            if _sha256(raw) != entry["sha256"]:
                raise RuntimeError(f"Checksum mismatch restoring orphan {key}")
            _put_minio_bytes(key, raw, content_type=entry.get("content_type") or "application/octet-stream")
            reverted += 1

        elif act == "dedup_primary_cover":
            old_key = entry["old_key"]
            new_key = entry["new_key"]
            mid_str = entry["manga_id"]
            raw, _ = minio_service.get_object_stream(new_key)
            _put_minio_bytes(old_key, raw, content_type=entry.get("content_type") or "image/jpeg")
            db.mangas.update_one({"_id": ObjectId(mid_str)}, {"$set": {"minio_cover_key": old_key}})
            for pm_id in entry.get("pool_manga_ids") or []:
                pool_db.pool_mangas.update_one(
                    {"_id": ObjectId(pm_id)},
                    {"$set": {"primary_cover.object_key": old_key}},
                )
            for tl_id in entry.get("tierlist_ids") or []:
                tl_doc = db.creator_tierlists.find_one({"_id": ObjectId(tl_id)})
                if tl_doc:
                    tiers = tl_doc.get("tiers") or []
                    for row in tiers:
                        for item in row.get("items") or []:
                            if item.get("selected_minio_key") == new_key:
                                item["selected_minio_key"] = old_key
                    db.creator_tierlists.update_one({"_id": ObjectId(tl_id)}, {"$set": {"tiers": tiers}})
            reverted += 1

        elif act == "optimize_png_cover":
            key = entry["key"]
            webp_raw, _ = minio_service.get_object_stream(key)
            with Image.open(io.BytesIO(webp_raw)) as im:
                buf = io.BytesIO()
                im.save(buf, format="PNG")
                png_raw = buf.getvalue()
            _put_minio_bytes(key, png_raw, content_type="image/png")
            pool_db.pool_mangas.update_many(
                {"primary_cover.object_key": key},
                {"$set": {"primary_cover.file_size": len(png_raw), "primary_cover.content_type": "image/png"}},
            )
            reverted += 1

        elif act == "optimize_chapter_pages":
            cid_str = entry["chapter_id"]
            mid_str = entry["manga_id"]
            rev_map: dict[str, tuple[str, int]] = {}
            for jp in entry.get("pages") or []:
                old_k = jp["old_key"]
                new_k = jp["new_key"]
                webp_raw, _ = minio_service.get_object_stream(new_k)
                with Image.open(io.BytesIO(webp_raw)) as im:
                    buf = io.BytesIO()
                    im.save(buf, format="PNG")
                    png_raw = buf.getvalue()
                _put_minio_bytes(old_k, png_raw, content_type="image/png")
                rev_map[new_k] = (old_k, len(png_raw))

            chap = db.chapters.find_one({"_id": ObjectId(cid_str)})
            if chap:
                pages = chap.get("pages") or []
                for p in pages:
                    nk = p.get("object_key")
                    if nk in rev_map:
                        ok, osz = rev_map[nk]
                        p["object_key"] = ok
                        p["file_size"] = osz
                        p["content_type"] = "image/png"
                        if isinstance(p.get("filename"), str) and p["filename"].lower().endswith(".webp"):
                            p["filename"] = p["filename"][:-5] + ".png"
                db.chapters.update_one(
                    {"_id": ObjectId(cid_str)},
                    {"$set": {"pages": pages, "file_size": sum(p.get("file_size", 0) for p in pages)}},
                )

            for nk, (ok, _osz) in rev_map.items():
                db.manga_panels.update_many(
                    {"chapter_id": cid_str, "page_minio_key": nk},
                    {"$set": {"page_minio_key": ok}},
                )
                db.panel_scan_pages.update_many(
                    {"chapter_id": cid_str, "object_key": nk},
                    {"$set": {"object_key": ok}},
                )

            for pc_doc in pool_db.pool_chapters.find({"pages.object_key": {"$in": list(rev_map.keys())}}):
                pc_pages = pc_doc.get("pages") or []
                for p in pc_pages:
                    nk = p.get("object_key")
                    if nk in rev_map:
                        ok, osz = rev_map[nk]
                        p["object_key"] = ok
                        p["file_size"] = osz
                        p["content_type"] = "image/png"
                pool_db.pool_chapters.update_one(
                    {"_id": pc_doc["_id"]},
                    {"$set": {"pages": pc_pages, "file_size": sum(p.get("file_size", 0) for p in pc_pages)}},
                )

            for nk in rev_map:
                minio_service.client.remove_object(minio_service.bucket, nk)
            reverted += 1

    # Rewrite remaining journal
    with journal_path.open("w", encoding="utf-8") as f:
        for rem in remaining:
            f.write(json.dumps(rem, ensure_ascii=False) + "\n")

    print(f"Rolled back {reverted} journaled operations.")
    return {"rolled_back": reverted}


def main() -> int:
    parser = argparse.ArgumentParser(description="Lossless MinIO Storage Optimizer with Backup & Rollback")
    parser.add_argument(
        "command",
        choices=["all", "backup", "clean-orphans", "dedup-covers", "optimize-covers", "optimize-chapters", "rollback"],
    )
    parser.add_argument("--backup-dir", default=str(DEFAULT_BACKUP_DIR))
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--color-mode", choices=["truecolor", "all"], default="all")
    parser.add_argument("--rollback-limit", type=int, default=None)
    args = parser.parse_args()

    backup_dir = Path(args.backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)
    mc = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)

    if args.command == "rollback":
        step_rollback(mc, backup_dir, limit=args.rollback_limit)
        return 0

    if args.command in ("all", "backup"):
        step_backup(mc, backup_dir)
    if args.command in ("all", "clean-orphans"):
        step_clean_orphans(mc, backup_dir)
    if args.command in ("all", "dedup-covers"):
        step_dedup_primary_covers(mc, backup_dir)
    if args.command in ("all", "optimize-covers"):
        step_optimize_png_covers(mc, backup_dir, workers=args.workers)
    if args.command in ("all", "optimize-chapters"):
        step_optimize_png_chapters(mc, backup_dir, workers=args.workers, color_mode=args.color_mode)

    disk_after = _measure_minio_data_disk_bytes()
    print(
        f"\n[DONE] Current MinIO physical disk: "
        f"{disk_after['total_bytes'] / (1024**2):.2f} MB ({disk_after['file_count']} files)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
