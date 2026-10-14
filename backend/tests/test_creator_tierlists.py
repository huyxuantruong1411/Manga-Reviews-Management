"""Unit and integration tests for Creator Tierlist Maker service and router.

Covers:
1. Creating first tierlist auto-sets is_default=True, creates preset rows, hydrates unranked pool.
2. Deduplication of manga across tiers in the same board.
3. Auto-discovery of newly added works with is_newly_discovered flag.
4. Auto-seeding items across tiers based on personal_rating.
5. Optimistic locking with revision conflict (409 Conflict).
6. Cloning a tierlist and toggling is_default exclusively per creator.
7. Comparing two versions (promoted, demoted, unchanged, newly_ranked, unranked).
8. Cover options and image streaming security boundary.
"""

from datetime import datetime, timezone
import pytest
from bson import ObjectId
import httpx
from fastapi import FastAPI

from backend.models.tierlist import (
    TierItemEntry,
    TierRowModel,
    TierlistCreateRequest,
    TierlistUpdateRequest,
    TierlistCloneRequest,
)


class MockCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def sort(self, *args, **kwargs):
        return self

    def __iter__(self):
        return iter(self._docs)

    def __aiter__(self):
        self._iter = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration

    async def to_list(self, length=None):
        return self._docs


class MockMongoCollection:
    def __init__(self, initial_docs=None):
        self.docs = {str(d["_id"]): dict(d) for d in (initial_docs or [])}

    async def find_one(self, query):
        for doc in self.docs.values():
            match = True
            for k, v in query.items():
                if k == "_id":
                    v_str = str(v)
                    if str(doc.get("_id")) != v_str:
                        match = False
                        break
                elif isinstance(v, dict):
                    if "$regex" in v:
                        import re
                        pattern = v["$regex"]
                        flags = re.IGNORECASE if "i" in v.get("$options", "") else 0
                        if not re.search(pattern, str(doc.get(k, "")), flags):
                            match = False
                            break
                    elif "$in" in v:
                        if doc.get(k) not in v["$in"]:
                            match = False
                            break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                return dict(doc)
        return None

    def find(self, query=None):
        query = query or {}
        matches = []
        for doc in self.docs.values():
            match = True
            for k, v in query.items():
                if k == "$or":
                    or_match = False
                    for subq in v:
                        sub_matches = True
                        for sk, sv in subq.items():
                            if isinstance(sv, dict) and "$regex" in sv:
                                import re
                                pattern = sv["$regex"]
                                flags = re.IGNORECASE if "i" in sv.get("$options", "") else 0
                                if not re.search(pattern, str(doc.get(sk, "")), flags):
                                    sub_matches = False
                                    break
                            elif doc.get(sk) != sv:
                                sub_matches = False
                                break
                        if sub_matches:
                            or_match = True
                            break
                    if not or_match:
                        match = False
                        break
                elif k == "_id" and isinstance(v, dict) and "$in" in v:
                    req_ids = [str(x) for x in v["$in"]]
                    if str(doc.get("_id")) not in req_ids:
                        match = False
                        break
                elif isinstance(v, dict):
                    if "$ne" in v:
                        if doc.get(k) == v["$ne"]:
                            match = False
                            break
                    elif "$regex" in v:
                        import re
                        pattern = v["$regex"]
                        flags = re.IGNORECASE if "i" in v.get("$options", "") else 0
                        if not re.search(pattern, str(doc.get(k, "")), flags):
                            match = False
                            break
                    elif "$in" in v:
                        if doc.get(k) not in v["$in"]:
                            match = False
                            break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                matches.append(dict(doc))
        return MockCursor(matches)

    async def insert_one(self, doc):
        d = dict(doc)
        if "_id" not in d:
            d["_id"] = ObjectId()
        self.docs[str(d["_id"])] = d
        return type("InsertResult", (), {"inserted_id": d["_id"]})()

    async def update_one(self, query, update):
        doc = await self.find_one(query)
        if not doc:
            return type("UpdateResult", (), {"matched_count": 0, "modified_count": 0})()
        doc_id = str(doc["_id"])
        target = self.docs[doc_id]
        if "$set" in update:
            for k, v in update["$set"].items():
                target[k] = v
        if "$inc" in update:
            for k, v in update["$inc"].items():
                target[k] = target.get(k, 0) + v
        return type("UpdateResult", (), {"matched_count": 1, "modified_count": 1})()

    async def update_many(self, query, update):
        matches = await self.find(query).to_list()
        count = 0
        for doc in matches:
            await self.update_one({"_id": doc["_id"]}, update)
            count += 1
        return type("UpdateResult", (), {"matched_count": count, "modified_count": count})()

    async def delete_one(self, query):
        doc = await self.find_one(query)
        if not doc:
            return type("DeleteResult", (), {"deleted_count": 0})()
        del self.docs[str(doc["_id"])]
        return type("DeleteResult", (), {"deleted_count": 1})()

    async def count_documents(self, query=None):
        return len(await self.find(query).to_list())


class MockDatabase:
    def __init__(self, mangas=None, cover_arts=None, tierlists=None):
        self.mangas = MockMongoCollection(mangas)
        self.cover_arts = MockMongoCollection(cover_arts)
        self.creator_tierlists = MockMongoCollection(tierlists)
        self.audit_logs = MockMongoCollection()


@pytest.fixture
def sample_mangas():
    m1_id = ObjectId("507f1f77bcf86cd799439011")
    m2_id = ObjectId("507f1f77bcf86cd799439012")
    m3_id = ObjectId("507f1f77bcf86cd799439013")
    m4_id = ObjectId("507f1f77bcf86cd799439014")

    t_created = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    return [
        {
            "_id": m1_id,
            "title": "Vanilla Spider",
            "author": "Abe Youichi",
            "artist": "Abe Youichi",
            "personal_rating": 9.5,
            "read_status": "completed",
            "year": "2013",
            "status": "completed",
            "content_rating": "safe",
            "minio_cover_key": f"covers/{m1_id}/cover.jpg",
            "created_at": t_created,
        },
        {
            "_id": m2_id,
            "title": "Chimoguri Ringo to Kingyobachi Otoko",
            "author": "Abe Youichi",
            "artist": "Someone Else",
            "personal_rating": 8.0,
            "read_status": "reading",
            "year": "2011",
            "status": "ongoing",
            "content_rating": "suggestive",
            "minio_cover_key": f"covers/{m2_id}/cover.jpg",
            "created_at": t_created,
        },
        {
            "_id": m3_id,
            "title": "Shourou Gohan",
            "author": "Another Writer",
            "artist": "Abe Youichi",
            "personal_rating": 7.0,
            "read_status": "plan_to_read",
            "year": "2018",
            "status": "completed",
            "content_rating": "safe",
            "minio_cover_key": f"covers/{m3_id}/cover.jpg",
            "created_at": t_created,
        },
        {
            "_id": m4_id,
            "title": "Oneshot Mystery",
            "author": "Abe Youichi",
            "artist": "Abe Youichi",
            "personal_rating": None,
            "read_status": "unread",
            "year": "2020",
            "status": "completed",
            "content_rating": "safe",
            "minio_cover_key": f"covers/{m4_id}/cover.jpg",
            "created_at": t_created,
        },
    ]


@pytest.fixture
def mock_db(sample_mangas):
    return MockDatabase(mangas=sample_mangas)


@pytest.mark.anyio
async def test_create_first_tierlist_sets_default_and_hydrates_pool(mock_db, monkeypatch):
    """Test 1: First tierlist created for author gets is_default=True, preset standard tiers, and full unranked pool."""
    from backend.services.tierlist_service import TierlistService

    monkeypatch.setattr("backend.services.tierlist_service.get_db", lambda: mock_db)
    monkeypatch.setattr("backend.services.tierlist_service.minio_service.get_presigned_url", lambda key: f"http://minio/{key}")

    service = TierlistService()
    req = TierlistCreateRequest(title="Main Tierlist", preset="standard")
    created = await service.create_tierlist("Abe Youichi", req)

    assert created.is_default is True
    assert created.creator_name == "Abe Youichi"
    assert created.creator_name_normalized == "abe youichi"
    assert len(created.tiers) == 5  # S, A, B, C, D
    assert created.tiers[0].label == "S"
    assert created.tiers[0].color_key == "crimson"

    # All 4 mangas should be in unranked pool
    assert len(created.unranked_pool) == 4
    assert created.analytics.total_creator_mangas == 4
    assert created.analytics.ranked_count == 0
    assert created.analytics.unranked_count == 4
    assert created.analytics.completion_pct == 0.0

    # Verify role resolution: m1 has both, m2 has author, m3 has artist
    roles_by_title = {item.title: item.creator_role for item in created.unranked_pool}
    assert roles_by_title["Vanilla Spider"] == "both"
    assert roles_by_title["Chimoguri Ringo to Kingyobachi Otoko"] == "author"
    assert roles_by_title["Shourou Gohan"] == "artist"


@pytest.mark.anyio
async def test_deduplicate_tier_items_in_board(mock_db, sample_mangas, monkeypatch):
    """Test 2: A manga cannot appear in multiple tiers; first occurrence wins, rest deduplicated."""
    from backend.services.tierlist_service import TierlistService

    monkeypatch.setattr("backend.services.tierlist_service.get_db", lambda: mock_db)
    monkeypatch.setattr("backend.services.tierlist_service.minio_service.get_presigned_url", lambda key: f"http://minio/{key}")

    service = TierlistService()
    m1_id = str(sample_mangas[0]["_id"])

    # Provide custom tiers with m1 in both S and A
    req = TierlistCreateRequest(
        title="Duplicate Check",
        preset="empty",
        tiers=[
            TierRowModel(row_id="r1", label="S", color_key="crimson", items=[TierItemEntry(manga_id=m1_id)]),
            TierRowModel(row_id="r2", label="A", color_key="amber", items=[TierItemEntry(manga_id=m1_id)]),
        ],
    )
    created = await service.create_tierlist("Abe Youichi", req)

    assert len(created.tiers[0].items) == 1
    assert created.tiers[0].items[0].manga_id == m1_id
    assert len(created.tiers[1].items) == 0  # Deduplicated from second row
    # m1 must NOT be in unranked pool
    unranked_ids = [item.manga_id for item in created.unranked_pool]
    assert m1_id not in unranked_ids


@pytest.mark.anyio
async def test_auto_discovery_of_newly_added_works(mock_db, sample_mangas, monkeypatch):
    """Test 3: Works added after tierlist creation appear in unranked_pool with is_newly_discovered=True."""
    from backend.services.tierlist_service import TierlistService

    monkeypatch.setattr("backend.services.tierlist_service.get_db", lambda: mock_db)
    monkeypatch.setattr("backend.services.tierlist_service.minio_service.get_presigned_url", lambda key: f"http://minio/{key}")

    service = TierlistService()
    created = await service.create_tierlist("Abe Youichi", TierlistCreateRequest(title="Discovery Test"))

    # Now simulate adding a new manga into DB with created_at in the future
    m5_id = ObjectId("507f1f77bcf86cd799439015")
    await mock_db.mangas.insert_one({
        "_id": m5_id,
        "title": "Brand New Work",
        "author": "Abe Youichi",
        "artist": "Abe Youichi",
        "personal_rating": 8.8,
        "read_status": "unread",
        "created_at": datetime(2026, 10, 14, 12, 0, 0, tzinfo=timezone.utc),
    })

    # Fetch hydrated detail
    refetched = await service.get_tierlist_by_id(str(created.id))
    new_item = next((item for item in refetched.unranked_pool if item.manga_id == str(m5_id)), None)
    assert new_item is not None
    assert new_item.is_newly_discovered is True


@pytest.mark.anyio
async def test_auto_seed_by_rating(mock_db, sample_mangas, monkeypatch):
    """Test 4: Auto-seed by rating places rated works into tiers and unrated into unranked pool."""
    from backend.services.tierlist_service import TierlistService

    monkeypatch.setattr("backend.services.tierlist_service.get_db", lambda: mock_db)
    monkeypatch.setattr("backend.services.tierlist_service.minio_service.get_presigned_url", lambda key: f"http://minio/{key}")

    service = TierlistService()
    req = TierlistCreateRequest(
        title="Auto Seeded",
        preset="standard",
        auto_seed_by_rating=True,
    )
    created = await service.create_tierlist("Abe Youichi", req)

    # Ratings: m1 (9.5 -> S), m2 (8.0 -> A), m3 (7.0 -> B), m4 (None -> unranked)
    assert len(created.tiers[0].items) == 1  # S
    assert created.tiers[0].items[0].personal_rating == 9.5
    assert len(created.tiers[1].items) == 1  # A
    assert created.tiers[1].items[0].personal_rating == 8.0
    assert len(created.tiers[2].items) == 1  # B
    assert created.tiers[2].items[0].personal_rating == 7.0

    # m4 with rating None stays in pool
    assert len(created.unranked_pool) == 1
    assert created.unranked_pool[0].title == "Oneshot Mystery"
    assert created.analytics.ranked_count == 3
    assert created.analytics.unranked_count == 1


@pytest.mark.anyio
async def test_optimistic_locking_revision_conflict(mock_db, monkeypatch):
    """Test 5: Expected revision prevents concurrent overwrite; returns 409 Conflict."""
    from backend.services.tierlist_service import TierlistService, TierlistRevisionConflictError

    monkeypatch.setattr("backend.services.tierlist_service.get_db", lambda: mock_db)
    monkeypatch.setattr("backend.services.tierlist_service.minio_service.get_presigned_url", lambda key: f"http://minio/{key}")

    service = TierlistService()
    created = await service.create_tierlist("Abe Youichi", TierlistCreateRequest(title="Locking Test"))
    assert created.revision == 1

    # Update with expected_revision=1 succeeds and increments to 2
    updated = await service.update_tierlist(
        str(created.id),
        TierlistUpdateRequest(title="Updated Title", expected_revision=1),
    )
    assert updated.revision == 2

    # Second update using stale expected_revision=1 must raise TierlistRevisionConflictError
    with pytest.raises(TierlistRevisionConflictError) as exc_info:
        await service.update_tierlist(
            str(created.id),
            TierlistUpdateRequest(title="Stale Update", expected_revision=1),
        )
    assert exc_info.value.current_revision == 2
    assert exc_info.value.expected_revision == 1


@pytest.mark.anyio
async def test_clone_and_exclusive_default(mock_db, monkeypatch):
    """Test 6: Cloning creates new independent doc; setting default unsets previous default."""
    from backend.services.tierlist_service import TierlistService

    monkeypatch.setattr("backend.services.tierlist_service.get_db", lambda: mock_db)
    monkeypatch.setattr("backend.services.tierlist_service.minio_service.get_presigned_url", lambda key: f"http://minio/{key}")

    service = TierlistService()
    v1 = await service.create_tierlist("Abe Youichi", TierlistCreateRequest(title="Version 1", is_default=True))
    assert v1.is_default is True

    # Clone v1 into v2 with set_as_default=True
    v2 = await service.clone_tierlist(
        str(v1.id),
        TierlistCloneRequest(new_title="Version 2", set_as_default=True),
    )
    assert v2.is_default is True
    assert v2.title == "Version 2"
    assert v2.revision == 1

    # v1 should now have is_default=False
    refetched_v1 = await service.get_tierlist_by_id(str(v1.id))
    assert refetched_v1.is_default is False


@pytest.mark.anyio
async def test_compare_two_tierlist_versions(mock_db, sample_mangas, monkeypatch):
    """Test 7: Comparing base and target correctly calculates rank movements."""
    from backend.services.tierlist_service import TierlistService

    monkeypatch.setattr("backend.services.tierlist_service.get_db", lambda: mock_db)
    monkeypatch.setattr("backend.services.tierlist_service.minio_service.get_presigned_url", lambda key: f"http://minio/{key}")

    service = TierlistService()
    m1_id = str(sample_mangas[0]["_id"])
    m2_id = str(sample_mangas[1]["_id"])
    m3_id = str(sample_mangas[2]["_id"])

    # Base: m1 in S (idx 0), m2 in A (idx 1), m3 unranked
    v_base = await service.create_tierlist(
        "Abe Youichi",
        TierlistCreateRequest(
            title="Base Version",
            preset="empty",
            tiers=[
                TierRowModel(row_id="r0", label="S", color_key="crimson", items=[TierItemEntry(manga_id=m1_id)]),
                TierRowModel(row_id="r1", label="A", color_key="amber", items=[TierItemEntry(manga_id=m2_id)]),
            ],
        ),
    )

    # Target: m1 in A (idx 1, demoted), m2 in S (idx 0, promoted), m3 in S (newly_ranked)
    v_target = await service.create_tierlist(
        "Abe Youichi",
        TierlistCreateRequest(
            title="Target Version",
            preset="empty",
            tiers=[
                TierRowModel(row_id="r0", label="S", color_key="crimson", items=[TierItemEntry(manga_id=m2_id), TierItemEntry(manga_id=m3_id)]),
                TierRowModel(row_id="r1", label="A", color_key="amber", items=[TierItemEntry(manga_id=m1_id)]),
            ],
        ),
    )

    cmp = await service.compare_tierlists(str(v_base.id), str(v_target.id))
    diff_by_id = {d.manga_id: d for d in cmp.diffs}

    assert diff_by_id[m1_id].movement == "demoted"
    assert diff_by_id[m2_id].movement == "promoted"
    assert diff_by_id[m3_id].movement == "newly_ranked"
    assert cmp.summary["demoted"] == 1
    assert cmp.summary["promoted"] == 1
    assert cmp.summary["newly_ranked"] == 1


@pytest.mark.anyio
async def test_stream_cover_image_security_boundary(mock_db, sample_mangas, monkeypatch):
    """Test 8: Cover image stream allows valid manga keys, rejects unassociated keys."""
    from backend.services.tierlist_service import TierlistService, TierlistAccessDeniedError

    monkeypatch.setattr("backend.services.tierlist_service.get_db", lambda: mock_db)

    service = TierlistService()
    m1_id = str(sample_mangas[0]["_id"])
    legit_key = sample_mangas[0]["minio_cover_key"]
    rogue_key = "secrets/database_credentials.json"

    # Legit key should resolve correctly
    resolved_key = await service.validate_and_resolve_cover_key(m1_id, legit_key)
    assert resolved_key == legit_key

    # None key defaults to manga's primary cover key
    default_key = await service.validate_and_resolve_cover_key(m1_id, None)
    assert default_key == legit_key

    # Rogue key not in manga or cover_arts must raise TierlistAccessDeniedError
    with pytest.raises(TierlistAccessDeniedError):
        await service.validate_and_resolve_cover_key(m1_id, rogue_key)


@pytest.mark.anyio
async def test_api_router_endpoints_e2e(mock_db, monkeypatch):
    """Test 9: FastAPI router endpoints verification."""
    from backend.routers.tierlists import router as tierlists_router

    monkeypatch.setattr("backend.services.tierlist_service.get_db", lambda: mock_db)
    monkeypatch.setattr("backend.services.tierlist_service.minio_service.get_presigned_url", lambda key: f"http://minio/{key}")
    monkeypatch.setattr("backend.services.tierlist_service.minio_service.get_object_stream", lambda key: (b"fake_image_bytes", "image/jpeg"))

    app = FastAPI()
    app.include_router(tierlists_router)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        # Create
        res = await client.post("/api/creators/Abe%20Youichi/tierlists", json={"title": "HTTP Test"})
        assert res.status_code == 201
        data = res.json()
        tierlist_id = data["_id"]
        assert data["title"] == "HTTP Test"
        assert data["is_default"] is True

        # List
        list_res = await client.get("/api/creators/Abe%20Youichi/tierlists")
        assert list_res.status_code == 200
        assert len(list_res.json()) == 1

        # Get
        get_res = await client.get(f"/api/tierlists/{tierlist_id}")
        assert get_res.status_code == 200

        # Update with conflict
        conflict_res = await client.put(f"/api/tierlists/{tierlist_id}", json={"expected_revision": 999})
        assert conflict_res.status_code == 409

        # Clone
        clone_res = await client.post(f"/api/tierlists/{tierlist_id}/clone", json={"new_title": "Cloned HTTP"})
        assert clone_res.status_code == 201

        # Delete
        del_res = await client.delete(f"/api/tierlists/{tierlist_id}")
        assert del_res.status_code == 204
