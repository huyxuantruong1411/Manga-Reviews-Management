from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from bson import ObjectId

from backend.services.chapter_service import chapter_service
from backend.services.chapter_slot_service import chapter_slot_service


class InMemoryCollection:
    def __init__(self):
        self.docs = {}

    async def insert_one(self, doc):
        _id = doc.get("_id") or ObjectId()
        doc_copy = dict(doc)
        doc_copy["_id"] = _id
        self.docs[str(_id)] = doc_copy
        return type("Result", (), {"inserted_id": _id})()

    async def find_one(self, query):
        for doc in self.docs.values():
            match = True
            for k, v in query.items():
                if k == "_id":
                    if str(doc.get("_id")) != str(v):
                        match = False
                        break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                return dict(doc)
        return None

    def find(self, query):
        class Cursor:
            def __init__(self, items):
                self.items = items

            def __aiter__(self):
                self.iter = iter(self.items)
                return self

            async def __anext__(self):
                try:
                    return next(self.iter)
                except StopIteration:
                    raise StopAsyncIteration

        matches = []
        for doc in self.docs.values():
            match = True
            for k, v in query.items():
                if k == "_id":
                    if str(doc.get("_id")) != str(v):
                        match = False
                        break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                matches.append(dict(doc))
        return Cursor(matches)

    async def update_one(self, query, update_spec):
        target = None
        for doc in self.docs.values():
            match = True
            for k, v in query.items():
                if k == "_id":
                    if str(doc.get("_id")) != str(v):
                        match = False
                        break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                target = doc
                break
        if not target:
            return type("Result", (), {"modified_count": 0})()

        if "$set" in update_spec:
            target.update(update_spec["$set"])
        return type("Result", (), {"modified_count": 1})()


@pytest.mark.anyio
async def test_update_single_chapter_metadata():
    chapters_col = InMemoryCollection()
    slots_col = InMemoryCollection()

    with (
        patch.object(chapter_service, "_get_chapters_col", return_value=chapters_col),
        patch.object(chapter_service, "_get_slots_col", return_value=slots_col),
        patch.object(chapter_slot_service, "_get_chapters_col", return_value=chapters_col),
        patch.object(chapter_slot_service, "_get_slots_col", return_value=slots_col),
    ):
        manga_id = str(ObjectId())
        now = datetime.now(timezone.utc)

        # Insert test chapter
        chap_doc = {
            "manga_id": manga_id,
            "chapter_number": "1",
            "chapter_numeric": 1.0,
            "volume": None,
            "title": "",
            "language": "en",
            "scanlation_group": None,
            "source": "mangafire",
            "pages": [],
            "page_count": 0,
            "created_at": now,
            "updated_at": now,
        }
        res = await chapters_col.insert_one(chap_doc)
        chap_id = str(res.inserted_id)

        # Update metadata
        updated = await chapter_service.update_chapter_metadata(
            chap_id,
            {
                "chapter_number": "14",
                "title": "Pocket-sized Sanada",
                "volume": "2",
                "scanlation_group": "Translator Team",
            },
        )

        assert updated["id"] == chap_id
        assert "_id" not in updated
        assert updated["chapter_number"] == "14"
        assert updated["chapter_numeric"] == 14.0
        assert updated["title"] == "Pocket-sized Sanada"
        assert updated["volume"] == "2"
        assert updated["scanlation_group"] == "Translator Team"

        # Verify JSON serializability for FastAPI response
        from fastapi.encoders import jsonable_encoder

        serialized = jsonable_encoder(updated)
        assert serialized["id"] == chap_id
        assert "_id" not in serialized

        # Verify in memory collection
        in_db = await chapters_col.find_one({"_id": ObjectId(chap_id)})
        assert in_db["chapter_number"] == "14"
        assert in_db["title"] == "Pocket-sized Sanada"
        assert in_db["volume"] == "2"


@pytest.mark.anyio
async def test_batch_update_chapter_metadata_volume():
    chapters_col = InMemoryCollection()
    slots_col = InMemoryCollection()

    with (
        patch.object(chapter_service, "_get_chapters_col", return_value=chapters_col),
        patch.object(chapter_service, "_get_slots_col", return_value=slots_col),
        patch.object(chapter_slot_service, "_get_chapters_col", return_value=chapters_col),
        patch.object(chapter_slot_service, "_get_slots_col", return_value=slots_col),
    ):
        manga_id = str(ObjectId())
        now = datetime.now(timezone.utc)

        c1 = await chapters_col.insert_one(
            {
                "manga_id": manga_id,
                "chapter_number": "1",
                "chapter_numeric": 1.0,
                "volume": None,
                "title": "Ch 1",
                "language": "en",
                "created_at": now,
                "updated_at": now,
            }
        )
        c2 = await chapters_col.insert_one(
            {
                "manga_id": manga_id,
                "chapter_number": "2",
                "chapter_numeric": 2.0,
                "volume": None,
                "title": "Ch 2",
                "language": "en",
                "created_at": now,
                "updated_at": now,
            }
        )
        c3 = await chapters_col.insert_one(
            {
                "manga_id": manga_id,
                "chapter_number": "3",
                "chapter_numeric": 3.0,
                "volume": None,
                "title": "Ch 3",
                "language": "en",
                "created_at": now,
                "updated_at": now,
            }
        )

        # Batch assign Volume 1 to c1 and c2
        res = await chapter_service.batch_update_chapter_metadata(
            manga_id=manga_id,
            chapter_ids=[str(c1.inserted_id), str(c2.inserted_id)],
            updates={"volume": "1"},
        )

        assert res["updated_count"] == 2

        doc1 = await chapters_col.find_one({"_id": c1.inserted_id})
        doc2 = await chapters_col.find_one({"_id": c2.inserted_id})
        doc3 = await chapters_col.find_one({"_id": c3.inserted_id})

        assert doc1["volume"] == "1"
        assert doc2["volume"] == "1"
        assert doc3["volume"] is None


@pytest.mark.anyio
async def test_batch_update_chapter_metadata_renumber():
    chapters_col = InMemoryCollection()
    slots_col = InMemoryCollection()

    with (
        patch.object(chapter_service, "_get_chapters_col", return_value=chapters_col),
        patch.object(chapter_service, "_get_slots_col", return_value=slots_col),
        patch.object(chapter_slot_service, "_get_chapters_col", return_value=chapters_col),
        patch.object(chapter_slot_service, "_get_slots_col", return_value=slots_col),
    ):
        manga_id = str(ObjectId())
        now = datetime.now(timezone.utc)

        c1 = await chapters_col.insert_one(
            {
                "manga_id": manga_id,
                "chapter_number": "1",
                "chapter_numeric": 1.0,
                "volume": None,
                "title": "",
                "language": "en",
                "created_at": now,
                "updated_at": now,
            }
        )
        c2 = await chapters_col.insert_one(
            {
                "manga_id": manga_id,
                "chapter_number": "1",
                "chapter_numeric": 1.0,
                "volume": None,
                "title": "",
                "language": "en",
                "created_at": now,
                "updated_at": now,
            }
        )

        # Renumber sequentially starting from 1 with step 1
        res = await chapter_service.batch_update_chapter_metadata(
            manga_id=manga_id,
            chapter_ids=[str(c1.inserted_id), str(c2.inserted_id)],
            updates={"renumber_start": 1, "renumber_step": 1},
        )

        assert res["updated_count"] == 2

        doc1 = await chapters_col.find_one({"_id": c1.inserted_id})
        doc2 = await chapters_col.find_one({"_id": c2.inserted_id})

        assert doc1["chapter_number"] == "1"
        assert doc2["chapter_number"] == "2"
        assert doc2["chapter_numeric"] == 2.0
