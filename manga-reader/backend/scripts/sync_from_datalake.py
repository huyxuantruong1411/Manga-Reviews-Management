#!/usr/bin/env python3
"""Sync & Push Pipeline: Ingest Manga Packages from Manga Data Lake & Storage Pool into Manga Reader.

Pipeline Flow:
  1. Queries Data Lake Pool API (http://localhost:8000/api/datalake-pool) for ready packages.
  2. For each package, fetches the self-contained Data Contract v2.0 manifest.
  3. Ingests metadata & chapter references into PostgreSQL (manga_reader_v2) with Zero-Copy MinIO S3 media references.
  4. If Data Lake backend is not running, falls back to ingesting local packages from `contracts/*.json`.
"""

from __future__ import annotations

import asyncio
import json

import httpx
from app.core.config import BASE_DIR, settings
from app.core.database import AsyncSessionLocal
from app.modules.mod2_manga_management.schemas import EtlIngestRequest
from app.modules.mod2_manga_management.service import manga_management_service
from app.schemas.contract_v2 import MangaReaderPackage


async def main() -> None:
    print("=" * 70)
    print("MANGA DATA LAKE POOL -> MANGA READER INGESTION PIPELINE")
    print("=" * 70)

    datalake_base_url = settings.DATA_LAKE_API_URL.rstrip("/")
    print(f"[1/3] Connecting to Manga Data Lake Pool API: {datalake_base_url}...", flush=True)

    synced_count = 0
    failed_count = 0

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{datalake_base_url}/mangas", params={"page_size": 100})
            if resp.status_code == 200:
                body = resp.json()
                items = body.get("items", [])
                print(f"[OK] Discovered {len(items)} manga packages in Data Lake Pool.", flush=True)

                async with AsyncSessionLocal() as db:
                    for item in items:
                        pmid = item.get("pool_manga_id")
                        title = item.get("title", pmid)
                        print(f" -> Ingesting '{title}' ({pmid})...", end=" ", flush=True)

                        # Fetch full package manifest
                        manifest_resp = await client.get(f"{datalake_base_url}/mangas/{pmid}/etl-manifest")
                        if manifest_resp.status_code != 200:
                            print(f"[FAILED] HTTP {manifest_resp.status_code}", flush=True)
                            failed_count += 1
                            continue

                        pkg = MangaReaderPackage.model_validate(manifest_resp.json())
                        await manga_management_service.ingest_package(
                            db=db,
                            admin=None,
                            payload=EtlIngestRequest(package=pkg, cdc_enabled=True),
                        )
                        print("[SUCCESS]", flush=True)
                        synced_count += 1
            else:
                print(f"[WARN] Data Lake returned HTTP {resp.status_code}: {resp.text}", flush=True)
    except Exception as exc:
        print(f"[NOTICE] Data Lake backend (:8000) is currently offline: {exc}", flush=True)
        print("         To start it: uv run --project backend uvicorn backend.main:app --port 8000", flush=True)

    # Fallback to local contracts if no packages synced from live API
    if synced_count == 0:
        print("\n[2/3] Checking local package contracts in 'contracts/' folder...")
        contracts_dir = BASE_DIR / "contracts"
        if contracts_dir.exists():
            async with AsyncSessionLocal() as db:
                for jf in sorted(contracts_dir.glob("*.json")):
                    if jf.name.endswith(".schema.json"):
                        continue
                    try:
                        raw = json.loads(jf.read_text(encoding="utf-8"))
                        pkg = MangaReaderPackage.model_validate(raw)
                        print(f" -> Ingesting local contract '{pkg.manga.title}' ({jf.name})...", end=" ")
                        await manga_management_service.ingest_package(
                            db=db,
                            admin=None,
                            payload=EtlIngestRequest(package=pkg, cdc_enabled=True),
                        )
                        print("[SUCCESS]")
                        synced_count += 1
                    except Exception as err:
                        print(f"[FAILED] {err}")
                        failed_count += 1

    print("\n" + "=" * 70)
    print(f"[3/3] PIPELINE COMPLETE: {synced_count} packages synced, {failed_count} errors.")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
