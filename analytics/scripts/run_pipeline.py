"""Single orchestration CLI for Manga Deep Analytics Medallion pipeline.

Stages:
  1. Validate schema_contract.yml
  2. Extract MongoDB collections to daily Bronze Parquet (or verify existing snapshot)
  3. Extract deterministic Bronze-to-Silver private TipTap review features
  4. Build dbt-duckdb models (bronze + silver + gold) & run all dbt tests into versioned DuckDB file
  5. Export Gold marts to validated Arrow IPC stream artifacts & manifest
  6. Atomically promote release and update current_release.json
  7. Retain recent releases (never deleting active or previous release) and write redacted run log
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
import time
import uuid
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import duckdb
import pyarrow as pa
from pyarrow import ipc

from analytics.scripts.export_arrow import export_release
from analytics.scripts.extract_bronze import resolve_analytics_home, run_bronze_extract
from analytics.scripts.extract_review_features import run_review_feature_extraction
from analytics.scripts.validate_contract import DEFAULT_CONTRACT_PATH, load_contract

logger = logging.getLogger("analytics.run_pipeline")

REPO_ROOT = Path(__file__).resolve().parents[2]
DBT_PROJECT_DIR = REPO_ROOT / "analytics" / "dbt_project"


def _resolve_dbt_executable() -> str:
    scripts_dir = Path(sys.executable).parent
    for candidate in ("dbt.exe", "dbt"):
        exe = scripts_dir / candidate
        if exe.exists():
            return str(exe)
    return "dbt"


def _ensure_runtime_profiles(home: Path) -> Path:
    profiles_dir = home / "profiles"
    profiles_dir.mkdir(parents=True, exist_ok=True)
    target = profiles_dir / "profiles.yml"
    example = DBT_PROJECT_DIR / "profiles.example.yml"
    target.write_text(example.read_text(encoding="utf-8"), encoding="utf-8")
    return profiles_dir


def _validate_existing_bronze_snapshot(home: Path, snap_date_str: str, contract: dict[str, Any]) -> dict[str, Any]:
    bronze_root = home / "lake" / "bronze"
    summary: dict[str, Any] = {}
    for entity_name, cfg in contract["entities"].items():
        if not cfg.get("enabled", False):
            continue
        dt_dir = bronze_root / entity_name / f"dt={snap_date_str}"
        parquet_file = dt_dir / "data.parquet"
        manifest_file = dt_dir / "manifest.json"
        if not parquet_file.exists() or not manifest_file.exists():
            if cfg.get("required", False):
                raise FileNotFoundError(f"Required Bronze snapshot missing for {entity_name} at dt={snap_date_str}")
            continue
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        if manifest.get("status") != "success":
            raise RuntimeError(f"Bronze manifest for {entity_name} dt={snap_date_str} is not success")
        summary[entity_name] = {
            "status": "verified_existing",
            "document_count": manifest.get("document_count", 0),
        }
    return summary


def validate_published_release(home: Path, release_id: str) -> dict[str, Any]:
    """Validate an immutable release directory's manifest, SHA-256 hashes, and Arrow IPC streams."""
    rel_dir = home / "releases" / release_id
    manifest_path = rel_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Release manifest not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("release_id") != release_id:
        raise ValueError(f"Manifest release_id mismatch: {manifest.get('release_id')} != {release_id}")

    validated_datasets = 0
    for ds_name, ds_meta in (manifest.get("datasets") or {}).items():
        if not ds_meta.get("enabled", False):
            continue
        arrow_path = rel_dir / ds_meta["relative_path"]
        if not arrow_path.exists():
            raise FileNotFoundError(f"Missing Arrow file for {ds_name}: {arrow_path}")
        actual_sha = hashlib.sha256(arrow_path.read_bytes()).hexdigest()
        if actual_sha != ds_meta["sha256"]:
            raise ValueError(f"SHA-256 mismatch for {ds_name}")
        with pa.memory_map(str(arrow_path), "rb") as src, ipc.open_stream(src) as reader:
            tbl = reader.read_all()
        if tbl.num_rows != ds_meta["rows"]:
            raise ValueError(f"Row count mismatch for {ds_name}: {tbl.num_rows} != {ds_meta['rows']}")
        validated_datasets += 1

    return {
        "release_id": release_id,
        "status": "valid",
        "validated_datasets": validated_datasets,
        "snapshot_date": manifest.get("snapshot_date"),
    }


def rollback_release(home: Path, target_release_id: str) -> dict[str, Any]:
    """Validate target release and atomically repoint current_release.json without mutating release files."""
    validation = validate_published_release(home, target_release_id)
    releases_root = home / "releases"
    manifest_path = releases_root / target_release_id / "manifest.json"
    manifest_sha = hashlib.sha256(manifest_path.read_bytes()).hexdigest()

    pointer_payload = {
        "release_id": target_release_id,
        "published_at": datetime.now(UTC).isoformat(),
        "snapshot_date": validation["snapshot_date"],
        "manifest_sha256": manifest_sha,
        "rollback": True,
    }
    tmp_pointer = releases_root / f".current_release.rollback.{uuid.uuid4().hex[:8]}.tmp"
    final_pointer = releases_root / "current_release.json"
    tmp_pointer.write_text(json.dumps(pointer_payload, indent=2), encoding="utf-8")
    os.replace(tmp_pointer, final_pointer)
    return pointer_payload


def _prune_old_releases(home: Path, retain_count: int, keep_ids: set[str]) -> list[str]:
    releases_root = home / "releases"
    if not releases_root.exists() or retain_count < 1:
        return []
    release_dirs = [d for d in releases_root.iterdir() if d.is_dir() and not d.name.startswith(".")]
    release_dirs.sort(key=lambda p: p.stat().st_mtime, reverse=True)

    pruned: list[str] = []
    kept = 0
    for d in release_dirs:
        if d.name in keep_ids or kept < retain_count:
            kept += 1
            continue
        shutil.rmtree(d, ignore_errors=True)
        pruned.append(d.name)
    return pruned


def _run_dbt_build(
    *,
    home: Path,
    duckdb_path: Path,
    snapshot_date_str: str,
    release_id: str,
    dbt_threads: int,
    duckdb_memory_limit: str,
) -> dict[str, Any]:
    profiles_dir = _ensure_runtime_profiles(home)
    duckdb_path.parent.mkdir(parents=True, exist_ok=True)
    if duckdb_path.exists():
        duckdb_path.unlink()

    bronze_root = (home / "lake" / "bronze").resolve().as_posix()
    silver_root = (home / "staging" / "silver_private").resolve().as_posix()

    dbt_vars = json.dumps(
        {
            "bronze_root": bronze_root,
            "silver_staging_root": silver_root,
            "as_of_date": snapshot_date_str,
            "release_id": release_id,
            "metric_definition_version": "1.0.0",
        }
    )

    env = os.environ.copy()
    env["ANALYTICS_DUCKDB_PATH"] = duckdb_path.resolve().as_posix()
    env["ANALYTICS_THREADS"] = str(dbt_threads)
    env["ANALYTICS_MEMORY_LIMIT"] = duckdb_memory_limit

    dbt_bin = _resolve_dbt_executable()
    cmd = [
        dbt_bin,
        "build",
        "--project-dir",
        str(DBT_PROJECT_DIR),
        "--profiles-dir",
        str(profiles_dir),
        "--vars",
        dbt_vars,
    ]
    logger.info("Running dbt build into %s", duckdb_path.name)
    proc = subprocess.run(cmd, check=False, env=env, capture_output=True, text=True)
    if proc.returncode != 0:
        logger.error("dbt build failed:\n%s\n%s", proc.stdout[-2000:], proc.stderr[-2000:])
        raise RuntimeError(f"dbt build failed with exit code {proc.returncode}")

    run_results_path = DBT_PROJECT_DIR / "target" / "run_results.json"
    counts: dict[str, int] = {"pass": 0, "error": 0, "warn": 0, "skip": 0}
    invocation_id = None
    if run_results_path.exists():
        rr = json.loads(run_results_path.read_text(encoding="utf-8"))
        invocation_id = rr.get("metadata", {}).get("invocation_id")
        for res in rr.get("results", []):
            st = res.get("status")
            if isinstance(st, str) and st in counts:
                counts[st] += 1
    summary: dict[str, Any] = {"status": "pass", **counts}
    return {"invocation_id": invocation_id, "test_summary": summary}


def _run_gold_sanity_checks(duckdb_path: Path) -> dict[str, int]:
    """Run independent Python statistical sanity checks after dbt writer closes."""
    con = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        immature_row = con.execute(
            "SELECT count(*) FROM gold.gld_backlog_velocity WHERE not is_cohort_matured AND cohort_completion_rate IS NOT NULL"
        ).fetchone()
        immature_leaks = int(immature_row[0]) if immature_row is not None else 0
        if immature_leaks != 0:
            raise RuntimeError(f"Sanity gate failed: {immature_leaks} immature backlog cohorts leaked non-null rates")

        sentiment_row = con.execute(
            "SELECT count(*) FROM gold.gld_review_aspect_profile WHERE sentiment_enabled"
        ).fetchone()
        sentiment_leaks = int(sentiment_row[0]) if sentiment_row is not None else 0
        if sentiment_leaks != 0:
            raise RuntimeError("Sanity gate failed: sentiment_enabled must remain false until evaluation gate passes")

        marts = con.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'gold'").fetchall()
        counts: dict[str, int] = {}
        for (m,) in marts:
            cnt_row = con.execute(f"SELECT count(*) FROM gold.{m}").fetchone()
            counts[m] = int(cnt_row[0]) if cnt_row is not None else 0
        return counts
    finally:
        con.close()


def run_pipeline(
    *,
    contract_path: Path = DEFAULT_CONTRACT_PATH,
    analytics_home: Path | None = None,
    snapshot_date: date | None = None,
    collections: list[str] | None = None,
    skip_extract: bool = False,
    existing_snapshot: str | None = None,
    dry_run: bool = False,
    force_extract: bool = False,
    allow_existing_uri: bool = False,
    batch_size: int = 500,
    max_documents: int | None = None,
    batch_sleep_ms: int = 0,
    dbt_threads: int = 2,
    duckdb_memory_limit: str = "4GB",
    retain_releases: int = 5,
    release_id_override: str | None = None,
) -> dict[str, Any]:
    started_at = datetime.now(UTC)
    t0 = time.perf_counter()
    run_id = uuid.uuid4().hex[:12]

    contract = load_contract(contract_path)
    home = resolve_analytics_home(analytics_home)
    snap_str = existing_snapshot or (snapshot_date or datetime.now(UTC).date()).isoformat()
    snap_dt = date.fromisoformat(snap_str)
    release_id = release_id_override or f"rel-{snap_str.replace('-', '')}-{started_at.strftime('%H%M%S')}-{run_id[:4]}"

    # Capture previous active release so it is never deleted or corrupted on failure
    prev_release_id = None
    pointer_file = home / "releases" / "current_release.json"
    if pointer_file.exists():
        try:
            prev_release_id = json.loads(pointer_file.read_text(encoding="utf-8")).get("release_id")
        except (OSError, json.JSONDecodeError):
            prev_release_id = None

    extract_summary: dict[str, Any] = {}
    if skip_extract:
        extract_summary = _validate_existing_bronze_snapshot(home, snap_str, contract)
    else:
        ext_res = run_bronze_extract(
            contract_path=contract_path,
            analytics_home=home,
            snapshot_date=snap_dt,
            collections=collections,
            batch_size=batch_size,
            max_documents=max_documents,
            dry_run=dry_run,
            force=force_extract,
            allow_existing_uri=allow_existing_uri,
            batch_sleep_s=max(0, batch_sleep_ms) / 1000.0,
        )
        extract_summary = ext_res["entities"]
        if ext_res["errors"]:
            raise RuntimeError(f"Bronze extraction reported errors: {ext_res['errors']}")

    if dry_run:
        return {
            "run_id": run_id,
            "status": "dry_run",
            "snapshot_date": snap_str,
            "previous_release_id": prev_release_id,
            "extract_summary": {k: v.get("status") for k, v in extract_summary.items()},
        }

    # Stage 2: Extract TipTap review features from Bronze Parquet
    review_stats = run_review_feature_extraction(analytics_home=home)

    # Stage 3: Build DuckDB warehouse under versioned release path
    duckdb_path = home / "warehouse" / "releases" / release_id / "manga_medallion.duckdb"
    dbt_info = _run_dbt_build(
        home=home,
        duckdb_path=duckdb_path,
        snapshot_date_str=snap_str,
        release_id=release_id,
        dbt_threads=dbt_threads,
        duckdb_memory_limit=duckdb_memory_limit,
    )

    # Stage 4: Independent sanity verification
    gold_counts = _run_gold_sanity_checks(duckdb_path)

    # Stage 5: Export Arrow IPC streams & atomically publish current_release.json
    manifest = export_release(
        duckdb_path=duckdb_path,
        release_id=release_id,
        snapshot_date=snap_str,
        analytics_home=home,
        contract_path=contract_path,
        dbt_invocation_id=dbt_info.get("invocation_id"),
        dbt_test_summary=dbt_info.get("test_summary"),
        publish=True,
    )

    keep_ids = {release_id}
    if prev_release_id:
        keep_ids.add(prev_release_id)
    pruned = _prune_old_releases(home, retain_releases, keep_ids)

    run_summary = {
        "run_id": run_id,
        "status": "success",
        "started_at": started_at.isoformat(),
        "completed_at": datetime.now(UTC).isoformat(),
        "duration_seconds": round(time.perf_counter() - t0, 3),
        "snapshot_date": snap_str,
        "release_id": release_id,
        "previous_release_id": prev_release_id,
        "review_feature_stats": review_stats,
        "dbt": dbt_info,
        "gold_row_counts": gold_counts,
        "pruned_releases": pruned,
        "datasets_published": sum(1 for v in manifest["datasets"].values() if v.get("enabled")),
    }

    logs_dir = home / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_file = logs_dir / f"run_{release_id}.json"
    log_file.write_text(json.dumps(run_summary, indent=2), encoding="utf-8")
    return run_summary


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="Orchestrate Manga Deep Analytics Medallion pipeline.")
    parser.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT_PATH)
    parser.add_argument("--analytics-home", type=Path, default=None)
    parser.add_argument("--date", type=str, default=None)
    parser.add_argument("--collections", type=str, default=None)
    parser.add_argument("--skip-extract", action="store_true")
    parser.add_argument("--existing-snapshot", type=str, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--allow-existing-uri", action="store_true")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--max-documents", type=int, default=None)
    parser.add_argument("--batch-sleep-ms", type=int, default=0)
    parser.add_argument("--dbt-threads", type=int, default=2)
    parser.add_argument("--duckdb-memory-limit", type=str, default="4GB")
    parser.add_argument("--retain-releases", type=int, default=5)
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--release", type=str, default=None)
    parser.add_argument("--rollback", type=str, default=None)
    parser.add_argument("--purge-local-data", action="store_true")
    parser.add_argument("--confirm-purge", action="store_true")

    args = parser.parse_args(argv)
    home = resolve_analytics_home(args.analytics_home)

    if args.purge_local_data:
        if not args.confirm_purge:
            print(
                json.dumps(
                    {
                        "action": "purge_preview",
                        "target": str(home),
                        "note": "Pass --confirm-purge to delete local analytics artifacts",
                    },
                    indent=2,
                )
            )
            return 0
        if home.exists():
            shutil.rmtree(home)
        print(json.dumps({"action": "purged", "target": str(home)}, indent=2))
        return 0

    if args.validate_only:
        if not args.release:
            raise ValueError("--release <release_id> is required with --validate-only")
        res = validate_published_release(home, args.release)
        print(json.dumps(res, indent=2))
        return 0

    if args.rollback:
        res = rollback_release(home, args.rollback)
        print(json.dumps(res, indent=2))
        return 0

    snap_dt = date.fromisoformat(args.date) if args.date else None
    cols = [c.strip() for c in args.collections.split(",") if c.strip()] if args.collections else None

    summary = run_pipeline(
        contract_path=args.contract,
        analytics_home=home,
        snapshot_date=snap_dt,
        collections=cols,
        skip_extract=args.skip_extract,
        existing_snapshot=args.existing_snapshot,
        dry_run=args.dry_run,
        force_extract=args.force,
        allow_existing_uri=args.allow_existing_uri,
        batch_size=args.batch_size,
        max_documents=args.max_documents,
        batch_sleep_ms=args.batch_sleep_ms,
        dbt_threads=args.dbt_threads,
        duckdb_memory_limit=args.duckdb_memory_limit,
        retain_releases=args.retain_releases,
    )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
