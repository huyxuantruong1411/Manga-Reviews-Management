"""Backfill utility to sync historical MongoDB audit logs into Elasticsearch."""

from __future__ import annotations

import argparse
import asyncio
import logging

from backend.config import settings
from backend.core.elasticsearch import close_es_client, init_es_client
from backend.database.connection import close_mongo_connection, connect_to_mongo, get_db
from backend.services.audit_search_service import audit_search_service

logger = logging.getLogger("elk.backfill")


async def backfill_audit_logs(batch_size: int = 500) -> int:
    """Read all audit logs from MongoDB and index them into Elasticsearch in batches.

    Returns the number of successfully indexed documents.
    """
    await connect_to_mongo()
    es_client = await init_es_client()
    if es_client is None:
        print("Error: Could not connect to Elasticsearch. Is the ELK stack running?")
        await close_mongo_connection()
        return 0

    db = get_db()
    total_docs = await db.audit_logs.count_documents({})
    print(f"Total audit logs in MongoDB: {total_docs}")

    if total_docs == 0:
        await close_mongo_connection()
        await close_es_client()
        return 0

    cursor = db.audit_logs.find().sort("timestamp", 1)
    indexed_count = 0
    current_batch: list[dict] = []

    async for doc in cursor:
        current_batch.append(doc)
        if len(current_batch) >= batch_size:
            for item in current_batch:
                success = await audit_search_service.index_audit_doc(item)
                if success:
                    indexed_count += 1
            print(f"Synced {indexed_count} / {total_docs} records...")
            current_batch.clear()

    # Flush remaining batch
    if current_batch:
        for item in current_batch:
            success = await audit_search_service.index_audit_doc(item)
            if success:
                indexed_count += 1
        current_batch.clear()

    print(f"Backfill complete! Successfully indexed {indexed_count} / {total_docs} audit logs.")
    await close_mongo_connection()
    await close_es_client()
    return indexed_count


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill MongoDB audit logs into Elasticsearch")
    parser.add_argument("--batch-size", type=int, default=500, help="Batch size for indexing")
    args = parser.parse_args()

    # Enable ES sync if not set
    settings.es_enabled = True
    asyncio.run(backfill_audit_logs(batch_size=args.batch_size))


if __name__ == "__main__":
    main()
