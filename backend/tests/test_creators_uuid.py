"""Tests for Creator UUID identity, slug generation, and homonymous creator disambiguation."""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId

from backend.services.creator_service import CreatorService


class FakeCreatorCollection:
    def __init__(self, initial_docs=None):
        self.docs = list(initial_docs or [])

    async def find_one(self, query):
        for d in self.docs:
            if self._matches(d, query):
                return dict(d)
        return None

    def find(self, query=None):
        query = query or {}
        matched = [dict(d) for d in self.docs if self._matches(d, query)]

        class FakeCursor:
            def __init__(self, items):
                self.items = items

            def sort(self, *args, **kwargs):
                return self

            def skip(self, n):
                self.items = self.items[n:]
                return self

            def limit(self, n):
                self.items = self.items[:n]
                return self

            def __aiter__(self):
                self._iter = iter(self.items)
                return self

            async def __anext__(self):
                try:
                    return next(self._iter)
                except StopIteration:
                    raise StopAsyncIteration

        return FakeCursor(matched)

    async def insert_one(self, doc):
        new_doc = dict(doc)
        if "_id" not in new_doc:
            new_doc["_id"] = ObjectId()
        self.docs.append(new_doc)
        res = MagicMock()
        res.inserted_id = new_doc["_id"]
        return res

    async def update_one(self, query, update, upsert=False):
        for i, d in enumerate(self.docs):
            if self._matches(d, query):
                if "$set" in update:
                    self.docs[i].update(update["$set"])
                return
        if upsert:
            new_doc = {}
            for k, v in query.items():
                if not k.startswith("$"):
                    new_doc[k] = v
            if "$setOnInsert" in update:
                new_doc.update(update["$setOnInsert"])
            if "$set" in update:
                new_doc.update(update["$set"])
            if "_id" not in new_doc:
                new_doc["_id"] = ObjectId()
            self.docs.append(new_doc)

    def _matches(self, doc, query):
        import re

        for k, v in query.items():
            if k == "$or":
                if not any(self._matches(doc, sub) for sub in v):
                    return False
                continue
            doc_val = doc.get(k)
            if isinstance(v, dict):
                if "$regex" in v:
                    flags = re.IGNORECASE if "i" in v.get("$options", "") else 0
                    if not isinstance(doc_val, str) or not re.search(v["$regex"], doc_val, flags):
                        return False
                elif "$in" in v:
                    if doc_val not in v["$in"]:
                        return False
            else:
                if doc_val != v:
                    return False
        return True


class TestCreatorUUIDAndHomonyms(unittest.IsolatedAsyncioTestCase):
    async def test_homonymous_creators_from_mangadex_do_not_overwrite_each_other(self):
        """Two creators with the same name 'Nakamura Moto' but different MangaDex UUIDs must stay separate."""
        fake_coll = FakeCreatorCollection()
        service = CreatorService()

        uuid_a = "7918d851-d77f-4ad6-9ec5-2c097320dc7e"
        uuid_b = "11111111-2222-4333-8444-555555555555"

        with (
            patch.object(service, "_get_creators_collection", return_value=fake_coll),
            patch("backend.services.creator_service.mangadex_service") as mock_md,
        ):
            mock_md.get_creator_by_id = AsyncMock(
                side_effect=[
                    {
                        "mangadex_id": uuid_a,
                        "name": "Nakamura Moto",
                        "biography": {"en": "First Nakamura Moto"},
                        "twitter": "https://twitter.com/nakamura_1",
                        "pixiv": None,
                        "youtube": None,
                        "website": None,
                    },
                    {
                        "mangadex_id": uuid_b,
                        "name": "Nakamura Moto",
                        "biography": {"en": "Second Nakamura Moto"},
                        "twitter": "https://twitter.com/nakamura_2",
                        "pixiv": None,
                        "youtube": None,
                        "website": None,
                    },
                ]
            )

            doc_a = await service.sync_creator_by_dex_id(uuid_a)
            doc_b = await service.sync_creator_by_dex_id(uuid_b)

            self.assertIsNotNone(doc_a)
            self.assertIsNotNone(doc_b)
            self.assertEqual(doc_a["creator_id"], uuid_a)
            self.assertEqual(doc_b["creator_id"], uuid_b)
            self.assertEqual(doc_a["slug"], "nakamura-moto")
            self.assertEqual(doc_b["slug"], "nakamura-moto")
            self.assertEqual(len(fake_coll.docs), 2)

            # Fetching by UUID returns the exact homonymous creator
            fetched_a = await service.get_creator_by_id_or_name(uuid_a)
            fetched_b = await service.get_creator_by_id_or_name(uuid_b)
            self.assertEqual(fetched_a["creator_id"], uuid_a)
            self.assertEqual(fetched_a["biography"]["en"], "First Nakamura Moto")
            self.assertEqual(fetched_a["links"]["twitter"], "https://twitter.com/nakamura_1")
            self.assertEqual(fetched_b["creator_id"], uuid_b)
            self.assertEqual(fetched_b["biography"]["en"], "Second Nakamura Moto")
            self.assertEqual(fetched_b["links"]["twitter"], "https://twitter.com/nakamura_2")

    async def test_resolve_or_create_creators_for_manga_handles_dex_meta_and_manual_names(self):
        fake_coll = FakeCreatorCollection()
        service = CreatorService()
        uuid_a = "7918d851-d77f-4ad6-9ec5-2c097320dc7e"

        with patch.object(service, "_get_creators_collection", return_value=fake_coll):
            refs = await service.resolve_or_create_creators_for_manga(
                author_str="Nakamura Moto, Manual CoAuthor",
                artist_str="Manual Artist",
                authors_meta=[{"id": uuid_a, "name": "Nakamura Moto"}],
                artists_meta=[],
            )
            self.assertEqual(len(refs), 3)
            nakamura_ref = next(r for r in refs if r["name"] == "Nakamura Moto")
            self.assertEqual(nakamura_ref["creator_id"], uuid_a)
            self.assertEqual(nakamura_ref["slug"], "nakamura-moto")
            self.assertEqual(nakamura_ref["role"], "author")

            coauthor_ref = next(r for r in refs if r["name"] == "Manual CoAuthor")
            self.assertTrue(coauthor_ref["creator_id"])
            self.assertEqual(coauthor_ref["slug"], "manual-coauthor")
            self.assertEqual(coauthor_ref["role"], "author")

            artist_ref = next(r for r in refs if r["name"] == "Manual Artist")
            self.assertTrue(artist_ref["creator_id"])
            self.assertEqual(artist_ref["slug"], "manual-artist")
            self.assertEqual(artist_ref["role"], "artist")

    def test_creator_tierlists_route_is_not_shadowed_by_creator_slug_route(self):
        """Ensure GET /api/creators/{creator_name}/tierlists routes to tierlists router, not /{creator_id}/{slug}."""
        from fastapi.testclient import TestClient

        from backend.main import app

        client = TestClient(app)
        with patch(
            "backend.routers.tierlists.tierlist_service.list_creator_tierlists",
            new=AsyncMock(return_value=[]),
        ) as mock_list_tierlists:
            res = client.get("/api/creators/Asano%20Inio/tierlists")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json(), [])
            mock_list_tierlists.assert_awaited_once_with("Asano Inio")
