"""Bounded, strictly read-only MongoDB-to-Bronze Parquet snapshot extractor.

Reads analytics/schema_contract.yml and writes daily Parquet partitions:
  <ANALYTICS_HOME>/lake/bronze/<entity>/dt=YYYY-MM-DD/data.parquet
  <ANALYTICS_HOME>/lake/bronze/<entity>/dt=YYYY-MM-DD/manifest.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import subprocess
import sys
import time
import uuid
from collections.abc import Iterable
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq
from bson import json_util
from dotenv import dotenv_values
from pymongo import MongoClient, ReadPreference

from analytics.scripts.validate_contract import DEFAULT_CONTRACT_PATH, load_contract

logger = logging.getLogger("analytics.extract_bronze")

REPO_ROOT = Path(__file__).resolve().parents[2]
EXTRACTOR_VERSION = "1.0.0"

# Canonical Extended JSON options preserving BSON types ($oid, $date, $numberDecimal, $binary, etc.)
CANONICAL_JSON_OPTIONS = json_util.CANONICAL_JSON_OPTIONS.with_options(tz_aware=True)

BRONZE_ARROW_SCHEMA = pa.schema(
    [
        pa.field("_source_database", pa.string(), nullable=False),
        pa.field("_source_collection", pa.string(), nullable=False),
        pa.field("_source_id", pa.string(), nullable=False),
        pa.field("_ingested_at", pa.timestamp("us", tz="UTC"), nullable=False),
        pa.field("_snapshot_date", pa.date32(), nullable=False),
        pa.field("_batch_id", pa.string(), nullable=False),
        pa.field("_document_hash", pa.string(), nullable=False),
        pa.field("_document_ejson", pa.string(), nullable=False),
    ]
)

SENSITIVE_TEXT_FIELDS = {"content_json", "content_text", "raw_text", "cleaned_text"}


def resolve_analytics_home(override: str | Path | None = None) -> Path:
    if override:
        return Path(override).resolve()
    env_home = os.environ.get("ANALYTICS_HOME")
    if env_home:
        return Path(env_home).resolve()
    return (REPO_ROOT / ".local" / "analytics").resolve()


def resolve_mongo_config(
    contract: dict[str, Any],
    allow_existing_uri: bool = False,
) -> tuple[str, str, str, str]:
    """Resolve MongoDB URI (without logging it) and database names."""
    env_path = REPO_ROOT / "backend" / ".env"
    dotenv_vals = dotenv_values(env_path) if env_path.exists() else {}

    source_cfg = contract["source"]
    primary_uri_var = source_cfg.get("uri_env_var", "ANALYTICS_MONGODB_URI")
    fallback_uri_var = source_cfg.get("fallback_uri_env_var", "MONGODB_URI")
    primary_db_var = source_cfg.get("primary_database_env_var", "DATABASE_NAME")
    pool_db_var = source_cfg.get("pool_database_env_var", "POOL_DATABASE_NAME")

    analytics_uri = os.environ.get(primary_uri_var) or dotenv_vals.get(primary_uri_var)
    uri_source = primary_uri_var
    if not analytics_uri:
        allow_env = os.environ.get("ANALYTICS_ALLOW_EXISTING_URI", "").lower() in {"1", "true", "yes"}
        if not (allow_existing_uri or allow_env):
            raise RuntimeError(
                f"{primary_uri_var} is not set. Pass --allow-existing-uri (or set ANALYTICS_ALLOW_EXISTING_URI=1) "
                f"to explicitly opt into local development {fallback_uri_var}."
            )
        analytics_uri = (
            os.environ.get(fallback_uri_var) or dotenv_vals.get(fallback_uri_var) or "mongodb://localhost:27017"
        )
        uri_source = fallback_uri_var
        logger.warning(
            "Using fallback %s for local Bronze extraction (explicit opt-in active; URI redacted).",
            fallback_uri_var,
        )

    primary_db = (
        os.environ.get(primary_db_var)
        or dotenv_vals.get(primary_db_var)
        or source_cfg.get("primary_database_default", "manga_library")
    )
    pool_db = (
        os.environ.get(pool_db_var)
        or dotenv_vals.get(pool_db_var)
        or source_cfg.get("pool_database_default", "manga_datalake_pool")
    )
    return analytics_uri, primary_db, pool_db, uri_source


def canonical_source_id(doc: dict[str, Any], primary_key: str = "_id") -> str:
    raw_id = doc.get(primary_key)
    if raw_id is None:
        return json_util.dumps(doc.get("_id"), json_options=CANONICAL_JSON_OPTIONS)
    return str(raw_id)


def serialize_document_ejson(doc: dict[str, Any]) -> str:
    """Serialize BSON document to deterministic canonical Extended JSON."""
    return json_util.dumps(doc, json_options=CANONICAL_JSON_OPTIONS, sort_keys=True)


def document_sha256(ejson_payload: str) -> str:
    return hashlib.sha256(ejson_payload.encode("utf-8")).hexdigest()


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _get_git_commit() -> str | None:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO_ROOT,
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        return out or None
    except (subprocess.SubprocessError, OSError):
        return None


def _write_parquet_chunk(
    writer: pq.ParquetWriter,
    rows: list[dict[str, Any]],
) -> None:
    if not rows:
        return
    table = pa.Table.from_pylist(rows, schema=BRONZE_ARROW_SCHEMA)
    writer.write_table(table)


def extract_collection_to_parquet(
    collection: Any,
    *,
    entity_name: str,
    database_alias: str,
    collection_name: str,
    entity_cfg: dict[str, Any],
    bronze_root: Path,
    snapshot_date: date,
    batch_id: str,
    batch_size: int = 500,
    max_documents: int | None = None,
    dry_run: bool = False,
    force: bool = False,
    batch_sleep_s: float = 0.0,
) -> dict[str, Any]:
    """Stream one MongoDB collection strictly read-only to atomic daily Parquet + manifest."""
    started_at = datetime.now(UTC)
    t0 = time.perf_counter()
    warnings: list[str] = []

    dt_str = snapshot_date.isoformat()
    target_dir = bronze_root / entity_name / f"dt={dt_str}"
    target_parquet = target_dir / "data.parquet"
    target_manifest = target_dir / "manifest.json"

    if target_parquet.exists() and target_manifest.exists() and not force and not dry_run:
        existing_manifest = json.loads(target_manifest.read_text(encoding="utf-8"))
        if existing_manifest.get("status") == "success":
            logger.info("Skipping %s dt=%s (already published; pass --force to replace)", entity_name, dt_str)
            return {**existing_manifest, "skipped": True}

    count_before = int(collection.count_documents({}))

    if dry_run:
        duration_s = round(time.perf_counter() - t0, 4)
        return {
            "batch_id": batch_id,
            "entity": entity_name,
            "snapshot_date": dt_str,
            "started_at": started_at.isoformat(),
            "completed_at": datetime.now(UTC).isoformat(),
            "status": "dry_run",
            "database_alias": database_alias,
            "collection": collection_name,
            "source_count_before": count_before,
            "document_count": min(count_before, max_documents) if max_documents is not None else count_before,
            "duration_seconds": duration_s,
            "batch_size": batch_size,
            "warnings": warnings,
            "data_classification": entity_cfg.get("data_classification", "internal"),
            "contains_sensitive_text": bool(entity_cfg.get("contains_sensitive_text", False)),
            "extractor_version": EXTRACTOR_VERSION,
        }

    target_dir.mkdir(parents=True, exist_ok=True)
    tmp_parquet = target_dir / f".data.{batch_id}.parquet.tmp"
    tmp_manifest = target_dir / f".manifest.{batch_id}.json.tmp"

    primary_key = entity_cfg.get("primary_key", "_id")
    extracted_count = 0
    chunk: list[dict[str, Any]] = []
    writer: pq.ParquetWriter | None = None

    try:
        writer = pq.ParquetWriter(tmp_parquet, BRONZE_ARROW_SCHEMA, compression="zstd")
        cursor = collection.find({}, batch_size=batch_size)
        if max_documents is not None and max_documents >= 0:
            cursor = cursor.limit(max_documents)

        for doc in cursor:
            ejson = serialize_document_ejson(doc)
            doc_hash = document_sha256(ejson)
            chunk.append(
                {
                    "_source_database": database_alias,
                    "_source_collection": collection_name,
                    "_source_id": canonical_source_id(doc, primary_key),
                    "_ingested_at": datetime.now(UTC),
                    "_snapshot_date": snapshot_date,
                    "_batch_id": batch_id,
                    "_document_hash": doc_hash,
                    "_document_ejson": ejson,
                }
            )
            extracted_count += 1
            if len(chunk) >= batch_size:
                _write_parquet_chunk(writer, chunk)
                chunk.clear()
                if batch_sleep_s > 0:
                    time.sleep(batch_sleep_s)

        if chunk:
            _write_parquet_chunk(writer, chunk)
            chunk.clear()

        writer.close()
        writer = None

        # Validate written Parquet by reopening and verifying schema & row count
        pf = pq.ParquetFile(tmp_parquet)
        verified_rows = pf.metadata.num_rows
        if verified_rows != extracted_count:
            raise RuntimeError(
                f"Parquet verification mismatch for {entity_name}: expected {extracted_count}, got {verified_rows}"
            )
        if not pf.schema_arrow.equals(BRONZE_ARROW_SCHEMA):
            raise RuntimeError(f"Parquet schema mismatch for {entity_name}")
        del pf

        count_after = int(collection.count_documents({}))
        if max_documents is None and count_before != count_after:
            warnings.append(
                f"Collection count changed during best-effort extract: before={count_before}, after={count_after}"
            )

        completed_at = datetime.now(UTC)
        parquet_bytes = tmp_parquet.stat().st_size
        parquet_sha = file_sha256(tmp_parquet)
        schema_fp = hashlib.sha256(str(BRONZE_ARROW_SCHEMA).encode("utf-8")).hexdigest()[:16]

        manifest = {
            "batch_id": batch_id,
            "entity": entity_name,
            "snapshot_date": dt_str,
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "status": "success",
            "database_alias": database_alias,
            "collection": collection_name,
            "document_count": extracted_count,
            "file_bytes": parquet_bytes,
            "sha256": parquet_sha,
            "schema_fingerprint": schema_fp,
            "source_count_before": count_before,
            "source_count_after": count_after,
            "duration_seconds": round(time.perf_counter() - t0, 4),
            "batch_size": batch_size,
            "warnings": warnings,
            "data_classification": entity_cfg.get("data_classification", "internal"),
            "contains_sensitive_text": bool(entity_cfg.get("contains_sensitive_text", False)),
            "extractor_version": EXTRACTOR_VERSION,
            "git_commit": _get_git_commit(),
        }
        tmp_manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        # Atomic replacement: Parquet first, then manifest
        os.replace(tmp_parquet, target_parquet)
        os.replace(tmp_manifest, target_manifest)
        return manifest
    except Exception:
        if writer is not None:
            try:
                writer.close()
            except OSError as close_exc:
                logger.debug("Ignoring writer close error during cleanup: %s", close_exc)
        for tmp_file in (tmp_parquet, tmp_manifest):
            if tmp_file.exists():
                try:
                    tmp_file.unlink()
                except OSError as unlink_exc:
                    logger.debug("Ignoring temp file unlink error during cleanup: %s", unlink_exc)
        raise


def run_bronze_extract(
    *,
    contract_path: Path = DEFAULT_CONTRACT_PATH,
    analytics_home: Path | None = None,
    snapshot_date: date | None = None,
    collections: Iterable[str] | None = None,
    batch_size: int = 500,
    max_documents: int | None = None,
    dry_run: bool = False,
    force: bool = False,
    allow_existing_uri: bool = False,
    read_preference: str = "primary",
    batch_sleep_s: float = 0.0,
) -> dict[str, Any]:
    contract = load_contract(contract_path)
    home = resolve_analytics_home(analytics_home)
    bronze_root = home / "lake" / "bronze"
    snap_date = snapshot_date or datetime.now(UTC).date()
    batch_id = str(uuid.uuid4())

    uri, primary_db_name, pool_db_name, uri_source = resolve_mongo_config(
        contract, allow_existing_uri=allow_existing_uri
    )
    pref = ReadPreference.PRIMARY if read_preference == "primary" else ReadPreference.SECONDARY_PREFERRED
    if read_preference != "primary":
        logger.warning("Using non-primary read preference '%s'; replication lag is possible.", read_preference)

    requested = {c.strip() for c in collections if c.strip()} if collections else None
    entities: dict[str, dict[str, Any]] = contract["entities"]

    selected_entities: list[tuple[str, dict[str, Any]]] = []
    for entity_name, cfg in entities.items():
        if requested is not None and entity_name not in requested and cfg.get("collection") not in requested:
            continue
        if not cfg.get("enabled", False):
            logger.info("Skipping disabled entity: %s", entity_name)
            continue
        selected_entities.append((entity_name, cfg))

    if not selected_entities:
        raise ValueError("No enabled entities matched the requested selection")

    client = MongoClient(uri, read_preference=pref, serverSelectionTimeoutMS=5000)
    results: dict[str, Any] = {}
    errors: list[str] = []

    try:
        client.admin.command("ping")
        primary_db = client[primary_db_name]
        pool_db = client[pool_db_name]
        primary_cols = set(primary_db.list_collection_names())
        pool_cols: set[str] | None = None

        for entity_name, cfg in selected_entities:
            db_alias = cfg["database"]
            col_name = cfg["collection"]
            required = bool(cfg.get("required", False))

            if db_alias == "primary":
                present_set = primary_cols
                target_db = primary_db
            else:
                if pool_cols is None:
                    pool_cols = set(pool_db.list_collection_names())
                present_set = pool_cols
                target_db = pool_db

            if col_name not in present_set:
                msg = f"Collection '{col_name}' missing in database '{db_alias}'"
                if required:
                    raise RuntimeError(msg)
                logger.warning("%s; skipping optional entity '%s'.", msg, entity_name)
                results[entity_name] = {"status": "skipped_missing", "collection": col_name}
                continue

            try:
                manifest = extract_collection_to_parquet(
                    target_db[col_name],
                    entity_name=entity_name,
                    database_alias=db_alias,
                    collection_name=col_name,
                    entity_cfg=cfg,
                    bronze_root=bronze_root,
                    snapshot_date=snap_date,
                    batch_id=batch_id,
                    batch_size=batch_size,
                    max_documents=max_documents,
                    dry_run=dry_run,
                    force=force,
                    batch_sleep_s=batch_sleep_s,
                )
                results[entity_name] = manifest
                logger.info(
                    "Entity %-20s status=%-10s docs=%s",
                    entity_name,
                    manifest.get("status"),
                    manifest.get("document_count"),
                )
            except Exception as exc:
                err_msg = f"Failed extracting {entity_name}: {type(exc).__name__}: {exc}"
                logger.error(err_msg)
                errors.append(err_msg)
                if required:
                    raise RuntimeError(err_msg) from exc
                results[entity_name] = {"status": "failed", "error": type(exc).__name__}
    finally:
        client.close()

    return {
        "batch_id": batch_id,
        "snapshot_date": snap_date.isoformat(),
        "uri_source_env": uri_source,
        "read_preference": read_preference,
        "dry_run": dry_run,
        "bronze_root": str(bronze_root),
        "entities": results,
        "errors": errors,
    }


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="Extract MongoDB collections into Bronze Parquet snapshots.")
    parser.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT_PATH)
    parser.add_argument("--analytics-home", type=Path, default=None)
    parser.add_argument("--date", type=str, default=None, help="Snapshot date YYYY-MM-DD (default: today UTC)")
    parser.add_argument("--collections", type=str, default=None, help="Comma-separated entity/collection names")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--max-documents", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--allow-existing-uri", action="store_true")
    parser.add_argument("--read-preference", choices=["primary", "secondary"], default="primary")
    parser.add_argument("--batch-sleep-ms", type=int, default=0)

    args = parser.parse_args(argv)
    snap_date = date.fromisoformat(args.date) if args.date else None
    cols = args.collections.split(",") if args.collections else None

    summary = run_bronze_extract(
        contract_path=args.contract,
        analytics_home=args.analytics_home,
        snapshot_date=snap_date,
        collections=cols,
        batch_size=args.batch_size,
        max_documents=args.max_documents,
        dry_run=args.dry_run,
        force=args.force,
        allow_existing_uri=args.allow_existing_uri,
        read_preference=args.read_preference,
        batch_sleep_s=max(0, args.batch_sleep_ms) / 1000.0,
    )
    print(
        json.dumps(
            {
                "batch_id": summary["batch_id"],
                "snapshot_date": summary["snapshot_date"],
                "entities": {k: v.get("status") for k, v in summary["entities"].items()},
            },
            indent=2,
        )
    )
    return 1 if summary["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
