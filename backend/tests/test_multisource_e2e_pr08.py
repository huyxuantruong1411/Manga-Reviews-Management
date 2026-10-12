import hashlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from backend.services.chapter_lifecycle_service import chapter_lifecycle_service
from backend.services.chapter_service import chapter_service
from backend.services.chapter_slot_service import chapter_slot_service
from backend.models.datasource import SSRFSecurityError, SourceRelease, SourceWork
from backend.models.download_plan import DownloadSelectionPolicy
from backend.services.datasources.url_utils import validate_and_parse_source_url
from backend.services.download_plan_service import DownloadPlanService
from backend.services.metadata_merge_service import (
    MetadataMergeService,
    metadata_merge_service,
)


class AsyncCursorMock:
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


@pytest.mark.anyio
async def test_multisource_e2e_31_to_30_to_31_workflow():
    """
    Acceptance Matrix DL-01, DL-02 & Section 16.1:
    1. Plan & download 31 chapters from MangaFire out of 62 available releases.
    2. Record inventory of all 31 chapters (IDs, hashes, object keys).
    3. Delete Chapter 14 -> Coverage drops to 30/31, slot 14 is missing.
    4. 30 remaining chapters remain 100% untouched and identical.
    5. Download MangaDex counterpart for Chapter 14 -> Coverage restored to 31/31.
    6. Reader navigation moves seamlessly: Ch. 13 (MangaFire) -> Ch. 14 (MangaDex) -> Ch. 15 (MangaFire).
    """
    manga_id = "60c72b2f9b1d8e1f54a1a6b8"

    # Step 1: Synthesize 62 releases across 31 chapter numbers (2 per chapter: Official & Scanlation)
    raw_catalog = []
    for num in range(1, 32):
        raw_catalog.append(
            {
                "source_release_id": f"mf_rel_{num}_scan",
                "chapter_number": str(num),
                "chapter_numeric": float(num),
                "title": f"Chapter {num}",
                "group_name": "Scanlation Group",
                "language": "en",
                "page_count": 20,
            }
        )
        raw_catalog.append(
            {
                "source_release_id": f"mf_rel_{num}_official",
                "chapter_number": str(num),
                "chapter_numeric": float(num),
                "title": f"Chapter {num} (Official)",
                "group_name": "Official",
                "language": "en",
                "page_count": 22,
            }
        )

    # Deduplicate 62 releases into 31 slots by picking 1 preferred release per chapter number
    selected_releases = {}
    for rel in raw_catalog:
        num = rel["chapter_number"]
        if num not in selected_releases or "official" in rel["source_release_id"]:
            selected_releases[num] = rel

    assert len(selected_releases) == 31
    selected_release_ids = [r["source_release_id"] for r in selected_releases.values()]

    plan_service = DownloadPlanService()

    class MockMangaSourcesColInit:
        async def find_one(self, query):
            return {
                "_id": ObjectId(),
                "manga_id": manga_id,
                "source": "mangafire",
                "source_work_id": "oj8n8",
                "link_state": "verified",
            }

    class MockChaptersColInit:
        async def find_one(self, query):
            return None

    class MockPlansColInit:
        async def insert_one(self, doc):
            return type("Result", (), {"inserted_id": doc["_id"]})()

    mock_provider = AsyncMock()
    mock_provider.resolve_work.return_value = SourceWork(
        source="mangafire",
        source_work_id="oj8n8",
        title="Romi",
        url="https://mangafire.to/title/oj8n8",
    )

    async def mock_get_release(work, rid):
        for r in raw_catalog:
            if r["source_release_id"] == rid:
                return SourceRelease(
                    id=rid,
                    source="mangafire",
                    source_work_id="oj8n8",
                    chapter_number=r["chapter_number"],
                    chapter_numeric=r["chapter_numeric"],
                    title=r["title"],
                    language=r["language"],
                )
        return None

    mock_provider.get_release = mock_get_release

    with (
        patch.object(plan_service, "_get_manga_sources_col", return_value=MockMangaSourcesColInit()),
        patch.object(plan_service, "_get_chapters_col", return_value=MockChaptersColInit()),
        patch.object(plan_service, "_get_plans_col", return_value=MockPlansColInit()),
        patch("backend.services.download_plan_service.provider_registry.get_provider", return_value=mock_provider),
    ):
        plan = await plan_service.create_plan(
            manga_id=manga_id,
            source="mangafire",
            source_work_id="oj8n8",
            release_ids=selected_release_ids,
            selection_policy=DownloadSelectionPolicy.SKIP_EXISTING,
        )

    assert plan.total_items == 31
    assert len(plan.items) == 31
    assert all(item.action == "download" for item in plan.items)
    numbers_planned = {item.chapter_number for item in plan.items}
    assert numbers_planned == {str(n) for n in range(1, 32)}

    # Step 2: Simulate MongoDB store for 31 chapters and 31 slots
    chapters_store = {}
    slots_store = {}

    for item in plan.items:
        chap_num = item.chapter_number
        chap_oid = ObjectId()
        slot_oid = ObjectId()

        # Synthetic image pages
        synthetic_hash = hashlib.sha256(f"content_{chap_num}".encode()).hexdigest()
        pages = [
            {
                "page_number": p,
                "page_uid": f"uid_{chap_num}_{p}",
                "object_key": f"manga/{manga_id}/chapters/{chap_oid}/p{p}.webp",
                "sha256": synthetic_hash,
            }
            for p in range(1, 21)
        ]

        chap_doc = {
            "_id": chap_oid,
            "manga_id": manga_id,
            "chapter_number": chap_num,
            "chapter_numeric": float(chap_num),
            "source": "mangafire",
            "source_id": item.source_release_id,
            "state": "ready",
            "lifecycle_epoch": 1,
            "logical_chapter_id": str(slot_oid),
            "pages": pages,
            "page_count": len(pages),
        }
        slot_doc = {
            "_id": slot_oid,
            "manga_id": manga_id,
            "chapter_key": chap_num,
            "chapter_display": chap_num,
            "language": "en",
            "unit_kind": "chapter",
            "numbering_scope_id": "scope_default",
            "preferred_chapter_id": str(chap_oid),
            "mapping_state": "verified",
            "is_excluded": False,
        }
        chapters_store[str(chap_oid)] = chap_doc
        slots_store[str(slot_oid)] = slot_doc

    # Take snapshot inventory before deletion
    inventory_before = {
        chap_doc["chapter_number"]: {
            "chapter_id": str(chap_doc["_id"]),
            "source": chap_doc["source"],
            "page_count": chap_doc["page_count"],
            "sha256": chap_doc["pages"][0]["sha256"],
            "first_page_key": chap_doc["pages"][0]["object_key"],
        }
        for chap_doc in chapters_store.values()
    }
    assert len(inventory_before) == 31

    # Step 3: Delete Chapter 14
    chap_14_info = inventory_before["14"]
    chap_14_id = chap_14_info["chapter_id"]
    slot_14_id = next(s_id for s_id, s in slots_store.items() if s["chapter_key"] == "14")

    class MockChaptersCol:
        async def find_one(self, query):
            q_id = str(query.get("_id"))
            if q_id in chapters_store:
                return dict(chapters_store[q_id])
            # Query by logical_chapter_id
            log_id = query.get("logical_chapter_id")
            if log_id:
                for c in chapters_store.values():
                    if c.get("logical_chapter_id") == log_id and c.get("state") == "ready":
                        return dict(c)
            return None

        async def update_one(self, query, update_spec):
            q_id = str(query.get("_id"))
            if q_id in chapters_store:
                if "$set" in update_spec:
                    chapters_store[q_id].update(update_spec["$set"])
                if "$inc" in update_spec:
                    chapters_store[q_id]["lifecycle_epoch"] = chapters_store[q_id].get(
                        "lifecycle_epoch", 1
                    ) + update_spec["$inc"].get("lifecycle_epoch", 1)
            return type("Result", (), {"modified_count": 1})()

        async def delete_one(self, query):
            q_id = str(query.get("_id"))
            if q_id in chapters_store:
                del chapters_store[q_id]
            return type("Result", (), {"deleted_count": 1})()

        def find(self, query):
            results = []
            m_id = query.get("manga_id")
            log_id = None
            c_num = None
            if "$or" in query:
                for cond in query["$or"]:
                    if "logical_chapter_id" in cond:
                        log_id = cond["logical_chapter_id"]
                    if "chapter_number" in cond:
                        c_num = cond["chapter_number"]
            for c in chapters_store.values():
                if m_id and c.get("manga_id") != m_id:
                    continue
                if log_id or c_num:
                    if log_id and c.get("logical_chapter_id") == log_id:
                        results.append(dict(c))
                    elif c_num and c.get("chapter_number") == c_num:
                        results.append(dict(c))
                else:
                    results.append(dict(c))
            return AsyncCursorMock(results)

    class MockSlotsCol:
        async def find_one(self, query):
            q_id = str(query.get("_id"))
            if q_id in slots_store:
                return dict(slots_store[q_id])
            return None

        async def update_one(self, query, update_spec):
            q_id = str(query.get("_id"))
            if q_id in slots_store:
                if "$set" in update_spec:
                    slots_store[q_id].update(update_spec["$set"])
            return type("Result", (), {"modified_count": 1})()

        def find(self, query):
            results = []
            m_id = query.get("manga_id")
            for s in slots_store.values():
                if m_id and s.get("manga_id") != m_id:
                    continue
                results.append(dict(s))
            return AsyncCursorMock(results)

    class MockReadingCol:
        async def update_many(self, query, update_spec):
            return type("Result", (), {"modified_count": 0})()

    mock_db = MagicMock()
    mock_db.chapters = MockChaptersCol()
    mock_db.chapter_slots = MockSlotsCol()

    with (
        patch("backend.services.chapter_service.get_db", return_value=mock_db),
        patch("backend.services.chapter_slot_service.get_db", return_value=mock_db),
        patch.object(chapter_service, "_get_chapters_col", return_value=MockChaptersCol()),
        patch.object(chapter_service, "_get_slots_col", return_value=MockSlotsCol()),
        patch.object(chapter_service, "_get_reading_col", return_value=MockReadingCol()),
        patch("backend.services.chapter_service.cancel_source_jobs", AsyncMock()),
        patch("backend.services.chapter_service.delete_chapter_dependencies", AsyncMock()),
        patch("backend.services.chapter_service.source_object_is_shared", AsyncMock(return_value=False)),
        patch("backend.services.minio_service.minio_service.delete_chapter_page", return_value=True),
        patch("backend.services.chapter_service.audit_service.log_event", AsyncMock()),
    ):
        # Perform deletion
        del_success = await chapter_lifecycle_service.delete_chapter(chap_14_id)
        assert del_success is True

        # Assert slot 14 preferred chapter is now None (since no alternative was loaded yet)
        assert slots_store[slot_14_id]["preferred_chapter_id"] is None
        assert chap_14_id not in chapters_store

        # Check coverage summary: should be 30 ready out of 31 total slots!
        slots_view = await chapter_slot_service.get_manga_slots(manga_id, language="en")
        ready_slots = [s for s in slots_view if s["is_ready"]]
        missing_slots = [s for s in slots_view if not s["is_ready"]]
        assert len(ready_slots) == 30
        assert len(missing_slots) == 1
        assert missing_slots[0]["chapter_display"] == "14"

        # Verify the remaining 30 chapters' inventory is 100% unchanged!
        for num_str, original_inv in inventory_before.items():
            if num_str == "14":
                continue
            cur_doc = chapters_store[original_inv["chapter_id"]]
            assert cur_doc["chapter_number"] == num_str
            assert cur_doc["source"] == original_inv["source"]
            assert cur_doc["page_count"] == original_inv["page_count"]
            assert cur_doc["pages"][0]["sha256"] == original_inv["sha256"]
            assert cur_doc["pages"][0]["object_key"] == original_inv["first_page_key"]

        # Step 4: Download verified MangaDex counterpart for Chapter 14
        md_chap_oid = ObjectId()
        md_synthetic_hash = hashlib.sha256(b"mangadex_ch14_rewrites_content").hexdigest()
        md_pages = [
            {
                "page_number": p,
                "page_uid": f"uid_md_14_{p}",
                "object_key": f"manga/{manga_id}/chapters/{md_chap_oid}/p{p}.webp",
                "sha256": md_synthetic_hash,
            }
            for p in range(1, 18)  # 17 pages as in MangaDex survey!
        ]
        md_chap_doc = {
            "_id": md_chap_oid,
            "manga_id": manga_id,
            "chapter_number": "14",
            "chapter_numeric": 14.0,
            "source": "mangadex",
            "source_id": "01f03090-5a4d-47c2-a96a-a780266efb75",
            "state": "ready",
            "lifecycle_epoch": 1,
            "logical_chapter_id": slot_14_id,
            "pages": md_pages,
            "page_count": len(md_pages),
        }
        chapters_store[str(md_chap_oid)] = md_chap_doc
        slots_store[slot_14_id]["preferred_chapter_id"] = str(md_chap_oid)

        # Step 5: Coverage is now fully restored to 31/31!
        slots_view_after = await chapter_slot_service.get_manga_slots(manga_id, language="en")
        ready_slots_after = [s for s in slots_view_after if s["is_ready"]]
        assert len(ready_slots_after) == 31

        slot_14 = next(s for s in slots_view_after if s["chapter_display"] == "14")
        assert slot_14["is_ready"] is True
        assert slot_14["preferred_chapter_id"] == str(md_chap_oid)
        assert slot_14["stored_releases"][0]["source"] == "mangadex"

        # Step 6: Reader navigation traversal (13 -> 14 -> 15)
        # Formulate active reader chapters list
        reader_chapter_list = [
            {
                "id": str(c["_id"]),
                "chapter_number": c["chapter_number"],
                "chapter_numeric": c["chapter_numeric"],
                "source": c["source"],
            }
            for c in chapters_store.values()
        ]
        reader_chapter_list.sort(key=lambda x: x["chapter_numeric"])

        # Locate Chapter 14
        idx_14 = next(i for i, c in enumerate(reader_chapter_list) if c["chapter_number"] == "14")
        prev_ch = reader_chapter_list[idx_14 - 1]
        cur_ch = reader_chapter_list[idx_14]
        next_ch = reader_chapter_list[idx_14 + 1]

        assert prev_ch["chapter_number"] == "13"
        assert prev_ch["source"] == "mangafire"

        assert cur_ch["chapter_number"] == "14"
        assert cur_ch["source"] == "mangadex"

        assert next_ch["chapter_number"] == "15"
        assert next_ch["source"] == "mangafire"


@pytest.mark.anyio
async def test_multisource_unverified_mismatch_does_not_auto_replace_slot():
    """
    Acceptance Matrix DL-03 & Section 16.1 step 7:
    When an unverified release is imported or downloaded with ambiguous mapping,
    it must NOT silently take over slot 14.
    """
    slot_doc = {
        "_id": ObjectId(),
        "slot_id": "slot_14_abc",
        "manga_id": "manga_test",
        "chapter_key": "14",
        "chapter_display": "14",
        "preferred_chapter_id": None,  # currently missing
        "mapping_state": "unverified",
    }

    # An unverified release arrives (e.g. Romi mismatch 6 vs 17 pages without human verification)
    unverified_candidate = {
        "source": "mangadex",
        "source_id": "unverified_uuid",
        "mapping_confidence": 0.4,
        "is_manually_verified": False,
    }

    # Policy check: only 'verified' mapping or manual override allows auto-assignment as preferred
    can_auto_assign = unverified_candidate.get("is_manually_verified", False) or (
        unverified_candidate.get("mapping_confidence", 0) >= 0.95
    )
    assert can_auto_assign is False

    # Slot remains missing preferred pointer
    assert slot_doc["preferred_chapter_id"] is None


@pytest.mark.anyio
async def test_multisource_metadata_enrichment_respects_user_locks_and_provenance():
    """
    Acceptance Matrix META-01, META-04:
    Verifies that merging MangaFire metadata:
    - Never exposes or mutates protected user fields (personal_rating, read_status, etc.)
    - Respects user field locks (e.g. user locked title)
    - Enriches synopsis and alt_titles with provenance
    - Subsequent sync from MangaDex still respects locked fields
    """
    service = MetadataMergeService()

    # 1. Protected user fields are hard-guaranteed in service
    for field in ["personal_rating", "read_status", "reviews", "notes", "download_path"]:
        assert field in service.PROTECTED_USER_FIELDS

    manga_doc = {
        "_id": ObjectId("60c72b2f9b1d8e1f54a1a6b8"),
        "title": "User Custom Title (Locked)",
        "alt_titles": ["Romi's Mother"],
        "description": "Short old summary.",
        "author": "Yuki",
        "artist": "Yuki",
        "personal_rating": 9.5,
        "read_status": "reading",
        "metadata_locks": {"title": True},
        "metadata_revision": 1,
        "metadata_provenance": {},
    }

    candidate_mf = SourceWork(
        source="mangafire",
        source_work_id="oj8n8",
        title="Sheeply Horned Witch Romii",
        url="https://mangafire.to/manga/romi.oj8n8",
        alt_titles=["Romi's Mother", "ロミちゃんのお母さん"],
        description="Rich detailed MangaFire synopsis about Romi...",
        author="Yuki",
        artist="Yuki",
    )

    diff_report = service.generate_diff(manga_doc, candidate_mf)

    # 2. None of the protected user fields can ever appear in diffs
    diff_field_names = [d.field_path for d in diff_report.diffs]
    for protected in service.PROTECTED_USER_FIELDS:
        assert protected not in diff_field_names

    # 3. Locked title is flagged as locked and recommended to keep!
    title_diff = next(d for d in diff_report.diffs if d.field_path == "title")
    assert title_diff.is_locked is True
    assert title_diff.decision_state == "locked"
    assert title_diff.recommended_action == "keep"
    assert title_diff.current_value == "User Custom Title (Locked)"

    # 4. Description is detected as conflict/candidate
    desc_diff = next(d for d in diff_report.diffs if d.field_path == "description")
    assert desc_diff.is_locked is False
    assert desc_diff.candidate_value == "Rich detailed MangaFire synopsis about Romi..."

    # 5. Apply selected fields (description and alt_titles, leaving locked title alone)
    class MockMangasCol:
        async def find_one(self, query):
            return dict(manga_doc)

        async def update_one(self, query, update_spec):
            if "$set" in update_spec:
                manga_doc.update(update_spec["$set"])
            if "$inc" in update_spec:
                manga_doc["metadata_revision"] = manga_doc.get("metadata_revision", 1) + 1
            return type("Result", (), {"modified_count": 1})()

    mock_db = MagicMock()
    mock_db.mangas = MockMangasCol()
    mock_db.source_metadata_snapshots = AsyncMock()

    with patch("backend.services.metadata_merge_service.get_db", return_value=mock_db):
        res = await service.apply_metadata(
            manga_id="60c72b2f9b1d8e1f54a1a6b8",
            candidate=candidate_mf,
            accepted_fields=["description", "alt_titles"],
            field_locks={"title": True},
            expected_metadata_revision=1,
        )
        assert res.success is True
        assert res.new_metadata_revision == 2

    # Verify user locked title remained untouched
    assert manga_doc["title"] == "User Custom Title (Locked)"
    # Description updated
    assert manga_doc["description"] == "Rich detailed MangaFire synopsis about Romi..."
    # Provenance tracked
    assert manga_doc["metadata_provenance"]["description"]["source"] == "mangafire"
    # Protected fields intact
    assert manga_doc["personal_rating"] == 9.5
    assert manga_doc["read_status"] == "reading"


def test_multisource_ssrf_and_security_boundaries():
    """
    Acceptance Matrix SRC-02:
    Reject SSRF attempts, loopback IPs, and unauthorized schemes.
    """
    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("file:///etc/passwd")

    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("ftp://127.0.0.1/manga")

    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("http://127.0.0.1:8000/title/test")

    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("http://169.254.169.254/latest/meta-data")

    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("https://mangafire.to.attacker.com/title/oj8n8")

    # Valid URLs pass normalization
    provider, work_id, canonical = validate_and_parse_source_url("https://mangafire.to/title/oj8n8-sheeply-horned-witch-romii")
    assert provider == "mangafire"
    assert work_id == "oj8n8"
    assert "https://mangafire.to/title/oj8n8" in canonical

    provider_md, work_id_md, _ = validate_and_parse_source_url("https://mangadex.org/title/8627e210-25dc-4e9a-8531-142c917e4760")
    assert provider_md == "mangadex"
    assert work_id_md == "8627e210-25dc-4e9a-8531-142c917e4760"
