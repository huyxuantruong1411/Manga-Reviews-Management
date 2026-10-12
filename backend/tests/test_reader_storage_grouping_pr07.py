from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from backend.services.chapter_slot_service import chapter_slot_service


@pytest.fixture
def sample_slot_doc():
    return {
        "_id": ObjectId("60c72b2f9b1d8e1f54a1a6b8"),
        "manga_id": "manga_123",
        "language": "en",
        "unit_kind": "chapter",
        "numbering_scope_id": "scope_default",
        "chapter_key": "14",
        "chapter_display": "14",
        "title": "POCKET-SIZED SANADA",
        "volume": None,
        "preferred_chapter_id": "chap_mf_14",
        "mapping_state": "verified",
        "is_excluded": False,
    }


@pytest.mark.anyio
async def test_slot_service_preferred_pointer_update(sample_slot_doc):
    mock_db = MagicMock()
    mock_slots_col = AsyncMock()
    mock_db.chapter_slots = mock_slots_col

    mock_slots_col.update_one.return_value = MagicMock(modified_count=1)

    with patch("backend.services.chapter_slot_service.get_db", return_value=mock_db):
        success = await chapter_slot_service.set_preferred_chapter(
            slot_id="60c72b2f9b1d8e1f54a1a6b8",
            chapter_id="chap_md_14",
        )
        assert success is True
        assert mock_slots_col.update_one.called
        update_args = mock_slots_col.update_one.call_args[0]
        assert update_args[0]["_id"] == ObjectId("60c72b2f9b1d8e1f54a1a6b8")
        assert update_args[1]["$set"]["preferred_chapter_id"] == "chap_md_14"


@pytest.mark.anyio
async def test_slot_service_get_manga_slots_with_alternatives(sample_slot_doc):
    mock_db = MagicMock()
    mock_slots_col = MagicMock()
    mock_chaps_col = MagicMock()

    mock_db.chapter_slots = mock_slots_col
    mock_db.chapters = mock_chaps_col

    # Cursor mock for find slots
    class AsyncCursor:
        def __init__(self, items):
            self.items = items

        def __aiter__(self):
            self._iter = iter(self.items)
            return self

        async def __anext__(self):
            try:
                return next(self._iter)
            except StopIteration:
                raise StopAsyncIteration

    mock_slots_col.find.return_value = AsyncCursor([dict(sample_slot_doc)])

    # Two releases: MangaFire and MangaDex for chapter 14
    releases = [
        {
            "_id": "chap_mf_14",
            "source": "mangafire",
            "source_id": "4618281",
            "page_count": 22,
            "state": "ready",
        },
        {
            "_id": "chap_md_14",
            "source": "mangadex",
            "source_id": "md_chap_14_uuid",
            "page_count": 17,
            "state": "ready",
        },
    ]
    mock_chaps_col.find.return_value = AsyncCursor(releases)

    with patch("backend.services.chapter_slot_service.get_db", return_value=mock_db):
        slots = await chapter_slot_service.get_manga_slots("manga_123", language="en")
        assert len(slots) == 1
        slot = slots[0]
        assert slot["chapter_display"] == "14"
        assert slot["stored_releases_count"] == 2
        assert slot["is_ready"] is True
        sources = [r["source"] for r in slot["stored_releases"]]
        assert "mangafire" in sources
        assert "mangadex" in sources


@pytest.mark.anyio
async def test_reader_navigation_skips_same_chapter_alternatives():
    """
    Ensure logical next/prev moves across distinct logical chapters,
    not looping between multiple releases of chapter 14.
    """
    all_chapters = [
        {"id": "c13", "chapter_number": "13", "chapter_numeric": 13.0, "source": "mangafire"},
        {"id": "c14_mf", "chapter_number": "14", "chapter_numeric": 14.0, "source": "mangafire"},
        {"id": "c14_md", "chapter_number": "14", "chapter_numeric": 14.0, "source": "mangadex"},
        {"id": "c15", "chapter_number": "15", "chapter_numeric": 15.0, "source": "mangafire"},
    ]

    current_chapter_id = "c14_mf"

    # Deduped logical sequence
    logical_map = {}
    for chap in all_chapters:
        num = chap["chapter_number"]
        if chap["id"] == current_chapter_id:
            logical_map[num] = chap
        elif num not in logical_map:
            logical_map[num] = chap

    logical_sequence = sorted(logical_map.values(), key=lambda c: c["chapter_numeric"])
    logical_nums = [c["chapter_number"] for c in logical_sequence]
    assert logical_nums == ["13", "14", "15"]

    cur_idx = next(i for i, c in enumerate(logical_sequence) if c["id"] == current_chapter_id)
    prev_chap = logical_sequence[cur_idx - 1] if cur_idx > 0 else None
    next_chap = logical_sequence[cur_idx + 1] if cur_idx < len(logical_sequence) - 1 else None

    # Next from Ch. 14 MUST be Ch. 15, NOT c14_md!
    assert prev_chap["chapter_number"] == "13"
    assert next_chap["chapter_number"] == "15"
    assert next_chap["id"] == "c15"
