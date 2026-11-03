#!/usr/bin/env python3
"""Seed sample MangaReaderPackage v2.0 (and optional live Data Lake Pool packages) into DB & MinIO."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from app.core.database import AsyncSessionLocal
from app.modules.mod2_manga_management.schemas import EtlIngestRequest
from app.modules.mod2_manga_management.service import manga_management_service
from app.schemas.contract_v2 import MangaReaderPackage

BASE_DIR = Path(__file__).resolve().parent.parent


async def main() -> None:
    sample_path = BASE_DIR / "contracts" / "manga_reader_example_v2.json"
    raw = json.loads(sample_path.read_text(encoding="utf-8"))
    package = MangaReaderPackage.model_validate(raw)

    async with AsyncSessionLocal() as db:
        result = await manga_management_service.ingest_package(
            db=db,
            admin=None,
            payload=EtlIngestRequest(package=package, cdc_enabled=True),
        )
        print(f"[SUCCESS] Seeded sample package: {result['pool_manga_id']} ({result['title']})")


if __name__ == "__main__":
    asyncio.run(main())
