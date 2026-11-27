"""Export curated Gold DuckDB marts to versioned Apache Arrow IPC stream artifacts.

Enforces:
- Flat scalar/primitive Arrow schemas only (no nested arrays, structs, Decimal128, or raw prose).
- IPC stream format (pyarrow.ipc.new_stream), verified by reopening with open_stream.
- Per-dataset row and byte budgets.
- Atomic staging-to-release promotion and immutable manifest generation.
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
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import duckdb
import pyarrow as pa
from pyarrow import ipc

from analytics.scripts.extract_bronze import resolve_analytics_home
from analytics.scripts.validate_contract import DEFAULT_CONTRACT_PATH, load_contract

logger = logging.getLogger("analytics.export_arrow")

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_VERSION = "1.0.0"
MIN_UI_VERSION = "1.0.0"
ARROW_MIME_TYPE = "application/vnd.apache.arrow.stream"

BANNED_SENSITIVE_COLUMNS = {
    "plain_text_private",
    "content_json",
    "content_text",
    "raw_text",
    "cleaned_text",
    "_document_ejson",
}

GOLD_MART_META: dict[str, dict[str, Any]] = {
    "gld_taste_calibration": {
        "grain": "cohort_scope x dimension_type x dimension_value",
        "description": "Shrunk and raw personal rating calibration across tags, demographics, languages, and content ratings.",
        "max_rows": 10000,
        "max_bytes": 10_000_000,
    },
    "gld_tag_synergy": {
        "grain": "tag_id_a x tag_id_b (unordered)",
        "description": "Tag pair co-occurrence, support, confidence, lift, smoothed PMI, and shrunk pair rating.",
        "max_rows": 25000,
        "max_bytes": 20_000_000,
    },
    "gld_series_completion_friction": {
        "grain": "length_bucket x publication_status_cohort x demographic_scope",
        "description": "Observed completion, drop/on-hold, and right-censored active shares by metadata chapter-count bucket.",
        "max_rows": 5000,
        "max_bytes": 5_000_000,
    },
    "gld_creator_consistency": {
        "grain": "creator_id x role",
        "description": "Canonical creator rating consistency, dispersion, and shrinkage mean separated by author/artist role.",
        "max_rows": 20000,
        "max_bytes": 15_000_000,
    },
    "gld_review_aspect_profile": {
        "grain": "aspect x rating_band x review_cohort",
        "description": "Observable bilingual aspect mention rates across rating bands (mention-only, no sentiment or psychology).",
        "max_rows": 5000,
        "max_bytes": 5_000_000,
    },
    "gld_backlog_velocity": {
        "grain": "cohort_month x milestone_window_days",
        "description": "Acquisition cohort completion curves (immature cells masked NULL) and unread backlog age percentiles.",
        "max_rows": 5000,
        "max_bytes": 5_000_000,
    },
    "gld_metadata_health": {
        "grain": "slice_group x field_name",
        "description": "Metadata field presence, provenance attribution, locks, staleness, and unresolved identity counts.",
        "max_rows": 5000,
        "max_bytes": 5_000_000,
    },
    "gld_external_consensus_gap": {
        "grain": "manga_id x provider_source",
        "description": "Personal rating compared separately against MAL/AniList aggregate scores and individual crawled reviews.",
        "max_rows": 25000,
        "max_bytes": 15_000_000,
    },
    "gld_ocr_lexical_atlas": {
        "grain": "manga_id x language x scan_mode x pipeline_version",
        "description": "Scanned-page OCR coverage, token occurrence counts, unique lemmas, and POS shares within compatible pipelines.",
        "max_rows": 25000,
        "max_bytes": 15_000_000,
    },
}


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


def _normalize_arrow_table(table: pa.Table, mart_name: str) -> pa.Table:
    """Validate flat primitive schema, strip disallowed types, normalize timestamps to UTC."""
    new_fields: list[pa.Field] = []
    new_columns: list[pa.Array | pa.ChunkedArray] = []

    for idx, field in enumerate(table.schema):
        if field.name in BANNED_SENSITIVE_COLUMNS:
            raise ValueError(f"Privacy violation: disallowed column '{field.name}' found in {mart_name}")

        t = field.type
        if pa.types.is_nested(t) or pa.types.is_decimal(t):
            raise ValueError(f"Unsupported Arrow type {t} for column '{field.name}' in {mart_name}")

        col = table.column(idx)
        if pa.types.is_timestamp(t):
            target_type = pa.timestamp("us", tz="UTC")
            if t != target_type:
                if t.tz is None:
                    # Treat naive timestamps as UTC consistently
                    import pyarrow.compute as pc

                    col = pc.assume_timezone(pc.cast(col, pa.timestamp("us")), "UTC")  # pyrefly: ignore[missing-attribute]
                else:
                    import pyarrow.compute as pc

                    col = pc.cast(col, target_type)
            new_fields.append(pa.field(field.name, target_type, nullable=field.nullable))
            new_columns.append(col)
        elif pa.types.is_large_string(t):
            import pyarrow.compute as pc

            new_fields.append(pa.field(field.name, pa.string(), nullable=field.nullable))
            new_columns.append(pc.cast(col, pa.string()))
        elif pa.types.is_integer(t) and t != pa.int64():
            import pyarrow.compute as pc

            new_fields.append(pa.field(field.name, pa.int64(), nullable=field.nullable))
            new_columns.append(pc.cast(col, pa.int64()))
        elif pa.types.is_floating(t) and t != pa.float64():
            import pyarrow.compute as pc

            new_fields.append(pa.field(field.name, pa.float64(), nullable=field.nullable))
            new_columns.append(pc.cast(col, pa.float64()))
        else:
            new_fields.append(field)
            new_columns.append(col)

    return pa.Table.from_arrays(new_columns, schema=pa.schema(new_fields))


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def export_release(
    *,
    duckdb_path: Path,
    release_id: str,
    snapshot_date: str,
    analytics_home: Path | None = None,
    contract_path: Path = DEFAULT_CONTRACT_PATH,
    dbt_invocation_id: str | None = None,
    dbt_test_summary: dict[str, Any] | None = None,
    publish: bool = False,
) -> dict[str, Any]:
    contract = load_contract(contract_path)
    home = resolve_analytics_home(analytics_home)
    marts_enabled: dict[str, bool] = contract.get("marts_enabled", {})

    staging_release_dir = home / "staging" / "releases" / release_id
    staging_arrow_dir = staging_release_dir / "arrow"
    if staging_release_dir.exists():
        shutil.rmtree(staging_release_dir)
    staging_arrow_dir.mkdir(parents=True, exist_ok=True)

    final_releases_root = home / "releases"
    final_releases_root.mkdir(parents=True, exist_ok=True)
    final_release_dir = final_releases_root / release_id

    con = duckdb.connect(str(duckdb_path), read_only=True)
    datasets_meta: dict[str, Any] = {}
    source_summary: dict[str, Any] = {}

    try:
        try:
            audit_rows = con.execute(
                "SELECT entity, max(snapshot_date)::varchar, max(document_count) "
                "FROM bronze.brz_snapshot_audit WHERE status = 'success' GROUP BY entity"
            ).fetchall()
            for ent, sdate, dcnt in audit_rows:
                source_summary[str(ent)] = {"snapshot_date": sdate, "document_count": int(dcnt or 0)}
        except duckdb.Error as exc:
            logger.debug("Could not read brz_snapshot_audit summary: %s", exc)

        for mart_name, meta in GOLD_MART_META.items():
            enabled = bool(marts_enabled.get(mart_name, True))
            if not enabled:
                datasets_meta[mart_name] = {
                    "name": mart_name,
                    "enabled": False,
                    "grain": meta["grain"],
                    "description": meta["description"],
                }
                continue

            raw_table = con.execute(f"SELECT * FROM gold.{mart_name}").fetch_arrow_table()
            norm_table = _normalize_arrow_table(raw_table, mart_name)

            max_rows = int(meta["max_rows"])
            max_bytes = int(meta["max_bytes"])
            if norm_table.num_rows > max_rows:
                raise RuntimeError(
                    f"Mart {mart_name} row count {norm_table.num_rows} exceeds max_rows budget {max_rows}"
                )

            rel_arrow_path = f"arrow/{mart_name}.arrow"
            arrow_path = staging_release_dir / rel_arrow_path
            with pa.OSFile(str(arrow_path), "wb") as sink, ipc.new_stream(sink, norm_table.schema) as writer:
                writer.write_table(norm_table)

            # Re-open and validate Arrow IPC stream
            with pa.memory_map(str(arrow_path), "rb") as source, ipc.open_stream(source) as reader:
                reopened = reader.read_all()
            if reopened.num_rows != norm_table.num_rows or not reopened.schema.equals(norm_table.schema):
                raise RuntimeError(f"Arrow IPC stream validation failed for {mart_name}")

            byte_size = arrow_path.stat().st_size
            if byte_size > max_bytes:
                raise RuntimeError(f"Mart {mart_name} byte size {byte_size} exceeds max_bytes budget {max_bytes}")

            rel_counts = {}
            if "reliability_status" in norm_table.schema.names:
                rel_rows = con.execute(
                    f"SELECT reliability_status, count(*) FROM gold.{mart_name} GROUP BY 1"
                ).fetchall()
                rel_counts = {str(k): int(v) for k, v in rel_rows}

            datasets_meta[mart_name] = {
                "name": mart_name,
                "enabled": True,
                "relative_path": rel_arrow_path,
                "rows": norm_table.num_rows,
                "bytes": byte_size,
                "sha256": _sha256_file(arrow_path),
                "mime_type": ARROW_MIME_TYPE,
                "schema": [{"name": f.name, "type": str(f.type)} for f in norm_table.schema],
                "grain": meta["grain"],
                "description": meta["description"],
                "max_rows": max_rows,
                "max_bytes": max_bytes,
                "reliability_counts": rel_counts,
            }
            logger.info("Exported %-32s rows=%-5d bytes=%d", mart_name, norm_table.num_rows, byte_size)
    finally:
        con.close()

    manifest = {
        "release_id": release_id,
        "created_at": datetime.now(UTC).isoformat(),
        "snapshot_date": snapshot_date,
        "pipeline_version": PIPELINE_VERSION,
        "min_ui_version": MIN_UI_VERSION,
        "metric_definition_version": "1.0.0",
        "git_commit": _get_git_commit(),
        "status": "published" if publish else "staged",
        "data_classification": "curated_personal_analytics_aggregates",
        "privacy_notice": "Browser workbench loads aggregated analytics without raw review or OCR prose.",
        "dbt_invocation_id": dbt_invocation_id,
        "dbt_test_summary": dbt_test_summary or {},
        "source_summary": source_summary,
        "datasets": datasets_meta,
    }

    manifest_path = staging_release_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    # Promote staged release into immutable releases/<release_id>/
    if final_release_dir.exists():
        shutil.rmtree(final_release_dir)
    os.replace(staging_release_dir, final_release_dir)

    if publish:
        pointer_payload = {
            "release_id": release_id,
            "published_at": datetime.now(UTC).isoformat(),
            "snapshot_date": snapshot_date,
            "manifest_sha256": _sha256_file(final_release_dir / "manifest.json"),
        }
        pointer_tmp = final_releases_root / f".current_release.{release_id}.json.tmp"
        pointer_final = final_releases_root / "current_release.json"
        pointer_tmp.write_text(json.dumps(pointer_payload, indent=2), encoding="utf-8")
        os.replace(pointer_tmp, pointer_final)
        logger.info("Published active release pointer -> %s", release_id)

    return manifest


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="Export Gold marts from DuckDB to Arrow IPC stream release.")
    parser.add_argument("--duckdb-path", type=Path, required=True)
    parser.add_argument("--release-id", type=str, required=True)
    parser.add_argument("--snapshot-date", type=str, required=True)
    parser.add_argument("--analytics-home", type=Path, default=None)
    parser.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT_PATH)
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args(argv)

    manifest = export_release(
        duckdb_path=args.duckdb_path,
        release_id=args.release_id,
        snapshot_date=args.snapshot_date,
        analytics_home=args.analytics_home,
        contract_path=args.contract,
        publish=args.publish,
    )
    print(
        json.dumps(
            {"release_id": manifest["release_id"], "status": manifest["status"], "datasets": len(manifest["datasets"])},
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
