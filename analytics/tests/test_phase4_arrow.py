"""Phase 4 tests: Arrow IPC stream export, budget guards, privacy checks, manifest hashes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import duckdb
import pyarrow as pa
import pytest
from analytics.scripts.export_arrow import (
    ARROW_MIME_TYPE,
    GOLD_MART_META,
    _normalize_arrow_table,
    export_release,
)
from pyarrow import ipc


def test_normalize_rejects_banned_prose_and_nested_types() -> None:
    bad_text_tbl = pa.table({"plain_text_private": ["secret review"], "x": [1]})
    with pytest.raises(ValueError, match="Privacy violation"):
        _normalize_arrow_table(bad_text_tbl, "gld_test")

    nested_tbl = pa.table({"arr": [[1, 2]]})
    with pytest.raises(ValueError, match="Unsupported Arrow type"):
        _normalize_arrow_table(nested_tbl, "gld_test")


def test_export_release_creates_valid_ipc_streams_and_pointer(tmp_path: Path) -> None:
    db_path = tmp_path / "test.duckdb"
    con = duckdb.connect(str(db_path))
    con.execute("CREATE SCHEMA bronze")
    con.execute("CREATE SCHEMA gold")
    con.execute(
        "CREATE TABLE bronze.brz_snapshot_audit AS "
        "SELECT 'mangas' AS entity, DATE '2026-11-28' AS snapshot_date, 10::BIGINT AS document_count, 'success' AS status"
    )
    for mart in GOLD_MART_META:
        con.execute(
            f"CREATE TABLE gold.{mart} AS "
            "SELECT DATE '2026-11-28' AS as_of_date, 'rel-1' AS release_id, '1.0.0' AS metric_definition_version, "
            "'k1' AS mart_row_key, 'high' AS reliability_status, 10::BIGINT AS sample_size, "
            "TIMESTAMP '2026-11-28 00:00:00' AS exported_ts"
        )
    con.close()

    home = tmp_path / "analytics_home"
    manifest = export_release(
        duckdb_path=db_path,
        release_id="rel-20261128-01",
        snapshot_date="2026-11-28",
        analytics_home=home,
        publish=True,
    )

    assert manifest["status"] == "published"
    pointer_path = home / "releases" / "current_release.json"
    assert pointer_path.exists()
    pointer = json.loads(pointer_path.read_text(encoding="utf-8"))
    assert pointer["release_id"] == "rel-20261128-01"

    for mart in GOLD_MART_META:
        ds = manifest["datasets"][mart]
        assert ds["mime_type"] == ARROW_MIME_TYPE
        assert ds["rows"] == 1
        arrow_file = home / "releases" / "rel-20261128-01" / ds["relative_path"]
        assert arrow_file.exists()
        assert hashlib.sha256(arrow_file.read_bytes()).hexdigest() == ds["sha256"]
        with pa.memory_map(str(arrow_file), "rb") as src, ipc.open_stream(src) as reader:
            tbl = reader.read_all()
        assert tbl.num_rows == 1
        assert tbl.schema.field("exported_ts").type == pa.timestamp("us", tz="UTC")
