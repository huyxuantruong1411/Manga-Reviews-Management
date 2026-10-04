"""TDD tests for Translation Font Packs, Vietnamese Glyph Coverage, and Storage Services.

Tests verify:
- Vietnamese glyph coverage analysis correctly validates diacritics.
- Font upload validates header magic bytes and persists font pack + asset.
- Non-font binary files are rejected.
- Storage usage summarizes assets by kind and supports dry-run cleanup.
"""

import pytest

from backend.services.translation.fonts import (
    VIETNAMESE_ALPHABET,
    check_vietnamese_glyph_coverage,
    translation_font_service,
)
from backend.services.translation.storage_service import translation_storage_service


def test_vietnamese_glyph_coverage_checker():
    """Verify glyph coverage calculation against supported vs unsupported codepoint sets."""
    # Complete unicode codepoints covering Vietnamese alphabet
    all_vi_codepoints = {ord(c) for c in VIETNAMESE_ALPHABET}
    # Add ASCII letters
    all_vi_codepoints.update({ord(c) for c in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"})

    fully_covered, missing, ratio = check_vietnamese_glyph_coverage(all_vi_codepoints)
    assert fully_covered is True
    assert len(missing) == 0
    assert ratio == 1.0

    # Test with missing diacritics (e.g. without 'Đ' and 'ư')
    incomplete = all_vi_codepoints - {ord("Đ"), ord("ư")}
    is_covered, missing_list, partial_ratio = check_vietnamese_glyph_coverage(incomplete)
    assert is_covered is False
    assert "Đ" in missing_list or "ư" in missing_list
    assert partial_ratio < 1.0


@pytest.mark.anyio
async def test_upload_font_pack_validates_and_persists(monkeypatch):
    """Uploading a font with valid TTF magic bytes stores the asset and registers the pack."""
    fake_assets = {}
    fake_font_packs = {}

    class MockAssetsCol:
        async def insert_one(self, doc):
            fake_assets[doc["asset_id"]] = doc
            return True

    class MockFontsCol:
        async def insert_one(self, doc):
            fake_font_packs[doc["font_pack_id"]] = doc
            return True

    class MockDB:
        def __getitem__(self, item):
            if item == "translation_assets":
                return MockAssetsCol()
            if item == "translation_font_packs":
                return MockFontsCol()
            raise KeyError(item)

    monkeypatch.setattr("backend.database.connection.get_db", lambda: MockDB())

    # Mock storage_service.upload_file
    async def mock_upload(object_key, file_bytes, content_type):
        return True

    monkeypatch.setattr(translation_storage_service, "upload_file", mock_upload)

    # Valid TrueType header magic bytes: 0x00, 0x01, 0x00, 0x00 followed by table count
    valid_ttf_header = b"\x00\x01\x00\x00\x00\x01\x00\x10\x00\x00\x00\x00" + b"\x00" * 100

    pack = await translation_font_service.upload_font_pack(
        name="Anime Ace Vi",
        file_bytes=valid_ttf_header,
        filename="animeace.ttf",
        license_note="OFL Open Font License",
    )

    assert pack["name"] == "Anime Ace Vi"
    assert "font_pack_id" in pack
    assert len(fake_assets) == 1
    assert len(fake_font_packs) == 1


@pytest.mark.anyio
async def test_upload_font_pack_rejects_invalid_file():
    """Uploading an invalid file (not TTF/OTF) raises ValueError."""
    invalid_bytes = b"This is a plaintext file, definitely not a font!"
    with pytest.raises(ValueError, match="Invalid font format"):
        await translation_font_service.upload_font_pack(
            name="Fake Font",
            file_bytes=invalid_bytes,
            filename="fake.txt",
        )


@pytest.mark.anyio
async def test_storage_usage_and_dry_run_cleanup(monkeypatch):
    """Storage usage aggregates bytes by kind and dry-run preview identifies unreferenced assets."""
    fake_assets = [
        {"asset_id": "a1", "kind": "demo_input", "file_size": 1000, "state": "available"},
        {"asset_id": "a2", "kind": "output_image", "file_size": 2500, "state": "available"},
        {"asset_id": "a3", "kind": "clean_image", "file_size": 1500, "state": "deleting"},
    ]

    class MockAssetsCol:
        def find(self, query=None):
            class Cursor:
                async def to_list(self, length=None):
                    if query and query.get("state") == "deleting":
                        return [a for a in fake_assets if a["state"] == "deleting"]
                    return fake_assets

            return Cursor()

    class MockDB:
        def __getitem__(self, item):
            return MockAssetsCol()

    monkeypatch.setattr("backend.database.connection.get_db", lambda: MockDB())

    usage = await translation_storage_service.get_storage_usage()
    assert usage["total_bytes"] == 5000
    assert usage["by_kind"]["demo_input"] == 1000
    assert usage["by_kind"]["output_image"] == 2500

    cleanup_preview = await translation_storage_service.preview_cleanup(dry_run=True)
    assert cleanup_preview["dry_run"] is True
    assert cleanup_preview["reclaimable_count"] == 1
    assert cleanup_preview["reclaimable_bytes"] == 1500
