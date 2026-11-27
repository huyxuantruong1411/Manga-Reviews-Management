"""Phase 1 tests: read-only guards, Extended JSON round-trip, streaming, atomic overwrite."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import pyarrow.parquet as pq
import pytest
from analytics.scripts.extract_bronze import (
    BRONZE_ARROW_SCHEMA,
    CANONICAL_JSON_OPTIONS,
    extract_collection_to_parquet,
    serialize_document_ejson,
)
from analytics.scripts.validate_contract import ContractValidationError, load_contract, validate_contract
from bson import Binary, Decimal128, ObjectId, json_util


class _FakeCursor:
    def __init__(self, docs: list[dict[str, Any]], expected_batch_size: int) -> None:
        self._docs = docs
        self._limit: int | None = None
        self.batch_size_used = expected_batch_size

    def limit(self, n: int) -> _FakeCursor:
        self._limit = n
        return self

    def to_list(self, length: int | None = None) -> list[dict[str, Any]]:
        raise AssertionError("Extractor must stream cursor, never call to_list()")

    def __iter__(self):
        items = self._docs[: self._limit] if self._limit is not None else self._docs
        return iter(items)


class ReadOnlyGuardCollection:
    """Fake Mongo collection that raises immediately on any mutation or unsafe operation."""

    def __init__(self, docs: list[dict[str, Any]]) -> None:
        self._docs = docs
        self.find_calls: list[dict[str, Any]] = []

    def count_documents(self, filt: dict[str, Any]) -> int:
        assert filt == {}
        return len(self._docs)

    def find(self, filt: dict[str, Any], batch_size: int = 500) -> _FakeCursor:
        assert filt == {}
        self.find_calls.append({"filter": filt, "batch_size": batch_size})
        return _FakeCursor(self._docs, batch_size)

    def _forbidden(self, *args: Any, **kwargs: Any) -> None:
        raise AssertionError("Read-only violation: mutation/write operation attempted!")

    insert_one = _forbidden
    insert_many = _forbidden
    update_one = _forbidden
    update_many = _forbidden
    replace_one = _forbidden
    delete_one = _forbidden
    delete_many = _forbidden
    bulk_write = _forbidden
    create_index = _forbidden
    drop_index = _forbidden
    drop = _forbidden
    aggregate = _forbidden


def test_contract_validation_passes_live_contract() -> None:
    contract = load_contract()
    assert contract["source"]["engine"] == "mongodb"
    assert contract["live_profile_complete"] is True
    assert "creator_tierlists" in contract["entities"]


def test_contract_validation_rejects_placeholders() -> None:
    with pytest.raises(ContractValidationError):
        validate_contract(
            {
                "contract_version": "1.0",
                "discovered_at": "<placeholder>",
                "source": {"engine": "mongodb"},
                "capabilities": {},
                "entities": {},
                "marts_enabled": {},
            }
        )


def test_canonical_ejson_roundtrip_bson_types() -> None:
    oid = ObjectId()
    uid = uuid.uuid4()
    dt = datetime(2026, 11, 28, 1, 30, 0, tzinfo=UTC)
    doc = {
        "_id": oid,
        "alt_id": "local-chapter-1",
        "price": Decimal128(Decimal("9.5")),
        "created_at": dt,
        "uuid_bin": Binary.from_uuid(uid),
        "nested": {"tags": ["a", "b"], "score": 9.5},
    }
    encoded = serialize_document_ejson(doc)
    decoded = json_util.loads(encoded, json_options=CANONICAL_JSON_OPTIONS)
    assert decoded["_id"] == oid
    assert decoded["price"] == Decimal128(Decimal("9.5"))
    assert decoded["created_at"] == dt
    assert decoded["uuid_bin"].as_uuid() == uid
    assert decoded["nested"]["tags"] == ["a", "b"]


def test_readonly_streaming_and_atomic_idempotency(tmp_path: Path) -> None:
    docs = [
        {"_id": ObjectId(), "title": f"Manga {i}", "personal_rating": 8.5, "secret_note": "private-text"}
        for i in range(12)
    ]
    coll = ReadOnlyGuardCollection(docs)
    bronze_root = tmp_path / "lake" / "bronze"
    snap_date = date(2026, 11, 28)

    manifest = extract_collection_to_parquet(
        coll,
        entity_name="mangas",
        database_alias="primary",
        collection_name="mangas",
        entity_cfg={"primary_key": "_id", "data_classification": "personal_library", "contains_sensitive_text": False},
        bronze_root=bronze_root,
        snapshot_date=snap_date,
        batch_id="batch-1",
        batch_size=5,
    )

    assert manifest["status"] == "success"
    assert manifest["document_count"] == 12
    assert coll.find_calls == [{"filter": {}, "batch_size": 5}]

    parquet_path = bronze_root / "mangas" / "dt=2026-11-28" / "data.parquet"
    manifest_path = bronze_root / "mangas" / "dt=2026-11-28" / "manifest.json"
    assert parquet_path.exists()
    assert manifest_path.exists()

    table = pq.read_table(parquet_path)
    assert table.schema.equals(BRONZE_ARROW_SCHEMA)
    assert table.num_rows == 12

    # Manifest must not leak credentials or raw doc text
    manifest_text = manifest_path.read_text(encoding="utf-8")
    assert "private-text" not in manifest_text
    assert "mongodb://" not in manifest_text

    # Same-day without --force skips cleanly
    skipped = extract_collection_to_parquet(
        coll,
        entity_name="mangas",
        database_alias="primary",
        collection_name="mangas",
        entity_cfg={"primary_key": "_id"},
        bronze_root=bronze_root,
        snapshot_date=snap_date,
        batch_id="batch-2",
        batch_size=5,
    )
    assert skipped.get("skipped") is True

    # Failed forced rerun must leave prior valid snapshot intact
    class FailingCollection(ReadOnlyGuardCollection):
        def find(self, filt: dict[str, Any], batch_size: int = 500):
            raise RuntimeError("Simulated mid-extract failure")

    with pytest.raises(RuntimeError, match="Simulated mid-extract failure"):
        extract_collection_to_parquet(
            FailingCollection(docs),
            entity_name="mangas",
            database_alias="primary",
            collection_name="mangas",
            entity_cfg={"primary_key": "_id"},
            bronze_root=bronze_root,
            snapshot_date=snap_date,
            batch_id="batch-3",
            force=True,
        )

    assert json.loads(manifest_path.read_text(encoding="utf-8"))["batch_id"] == "batch-1"
    assert pq.read_table(parquet_path).num_rows == 12
