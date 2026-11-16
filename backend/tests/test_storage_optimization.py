import asyncio
import io
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest
from bson import ObjectId
from PIL import Image


def _make_png_bytes(arr: np.ndarray, mode: str = "RGB") -> bytes:
    img = Image.fromarray(arr, mode=mode)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_mgtile_container_roundtrip_and_tile_deduplication():
    from backend.utils.mgtile_container import MangaMatrixContainer

    # Create 2 synthetic manga pages (128x64) with large shared white margins and a distinct center box
    page1 = np.full((128, 64), 255, dtype=np.uint8)
    page1[32:64, 16:48] = 0

    page2 = np.full((128, 64), 255, dtype=np.uint8)
    page2[64:96, 16:48] = 128

    container = MangaMatrixContainer(tile_size=16, zstd_level=3)
    blob, stats = container.pack_pages([page1, page2])

    assert blob.startswith(b"MGTL\x01")
    assert stats["total_pages"] == 2
    assert stats["unique_tiles"] < stats["total_tiles"]

    rec1 = container.extract_page(blob, 0)
    rec2 = container.extract_page(blob, 1)

    assert np.array_equal(page1, rec1)
    assert np.array_equal(page2, rec2)


def test_mgtile_container_rejects_invalid_header():
    from backend.utils.mgtile_container import MangaMatrixContainer

    container = MangaMatrixContainer(tile_size=16)
    with pytest.raises(ValueError, match="Invalid MGTL"):
        container.extract_page(b"NOT_MGTL_DATA", 0)


def test_optimize_png_bytes_to_webp_lossless_pixel_exact():
    from backend.utils.mgtile_container import optimize_png_bytes_to_webp_lossless

    # Create a 256x256 RGB illustration-like image (gradient bands + subtle dithering)
    # where VP8L spatial/color transforms reliably outperform even high-level PNG deflate.
    rng = np.random.default_rng(42)
    x = np.linspace(0, 255, 256, dtype=np.uint8)
    grid_x, grid_y = np.meshgrid(x, x)
    base = np.stack([grid_x, 255 - grid_y, ((grid_x.astype(np.uint16) + grid_y) // 2).astype(np.uint8)], axis=-1)
    rgb = np.clip((base // 16) * 16 + rng.integers(0, 4, size=(256, 256, 3), dtype=np.uint8), 0, 255).astype(np.uint8)
    raw_png = _make_png_bytes(rgb, mode="RGB")

    optimized, changed = optimize_png_bytes_to_webp_lossless(raw_png, method=4)
    assert changed is True
    assert len(optimized) < len(raw_png)
    assert optimized[:4] == b"RIFF" and optimized[8:12] == b"WEBP"

    with Image.open(io.BytesIO(optimized)) as dec_img:
        dec_arr = np.asarray(dec_img.convert("RGB"))
    assert np.array_equal(rgb, dec_arr)

    # Size-guard: if threshold exceeds achievable savings, original PNG is kept untouched
    untouched, threshold_changed = optimize_png_bytes_to_webp_lossless(
        raw_png,
        method=2,
        min_savings_ratio=0.99,
    )
    assert threshold_changed is False
    assert untouched == raw_png


def test_optimize_png_bytes_skips_jpeg_without_reencoding():
    from backend.utils.mgtile_container import optimize_png_bytes_to_webp_lossless

    rgb = np.full((64, 64, 3), 200, dtype=np.uint8)
    buf = io.BytesIO()
    Image.fromarray(rgb, mode="RGB").save(buf, format="JPEG", quality=90)
    raw_jpg = buf.getvalue()

    out, changed = optimize_png_bytes_to_webp_lossless(raw_jpg)
    assert changed is False
    assert out == raw_jpg


def test_delete_covers_for_manga_protects_shared_primary_cover():
    from backend.services.cover_art_service import CoverArtService

    async def _run():
        service = CoverArtService()
        manga_id = str(ObjectId())
        shared_key = "cover-arts/dex-1/cover-primary.jpg"
        unshared_key = "cover-arts/dex-1/cover-vol2.jpg"

        docs = [
            {"_id": ObjectId(), "manga_id": manga_id, "minio_key": shared_key},
            {"_id": ObjectId(), "manga_id": manga_id, "minio_key": unshared_key},
        ]

        class _FakeCursor:
            def __init__(self, items):
                self._items = list(items)

            def __aiter__(self):
                self._iter = iter(self._items)
                return self

            async def __anext__(self):
                try:
                    return next(self._iter)
                except StopIteration:
                    raise StopAsyncIteration

        fake_db = MagicMock()
        fake_db.cover_arts.find.return_value = _FakeCursor(docs)
        fake_db.cover_arts.delete_many = AsyncMock()

        async def _fake_shared(db, key, **kwargs):
            return key == shared_key

        with (
            patch("backend.services.cover_art_service.get_db", return_value=fake_db),
            patch("backend.services.cover_art_service.source_object_is_shared", side_effect=_fake_shared),
            patch("backend.services.cover_art_service.minio_service.delete_cover") as mock_del,
        ):
            res = await service.delete_covers_for_manga(manga_id)
            assert res is True
            mock_del.assert_called_once_with(unshared_key)
            fake_db.cover_arts.delete_many.assert_awaited_once_with({"manga_id": manga_id})

    asyncio.run(_run())


def test_tierlist_cover_options_deduplicates_shared_default_cover():
    from backend.services.tierlist_service import TierlistService

    async def _run():
        service = TierlistService()
        mid = ObjectId()
        shared_key = "cover-arts/dex-123/cov-1.jpg"
        vol2_key = "cover-arts/dex-123/cov-2.jpg"
        cov1_id = ObjectId()
        cov2_id = ObjectId()

        fake_mangas = MagicMock()
        fake_mangas.find_one = AsyncMock(return_value={"_id": mid, "minio_cover_key": shared_key})

        class _FakeCursor:
            def __init__(self, items):
                self._items = list(items)

            def __aiter__(self):
                self._iter = iter(self._items)
                return self

            async def __anext__(self):
                try:
                    return next(self._iter)
                except StopIteration:
                    raise StopAsyncIteration

        fake_covers = MagicMock()
        fake_covers.find.return_value = _FakeCursor(
            [
                {"_id": cov1_id, "manga_id": str(mid), "minio_key": shared_key, "volume": "1", "locale": "ja"},
                {"_id": cov2_id, "manga_id": str(mid), "minio_key": vol2_key, "volume": "2", "locale": "ja"},
            ]
        )

        with (
            patch.object(service, "_get_mangas_collection", return_value=fake_mangas),
            patch.object(service, "_get_cover_arts_collection", return_value=fake_covers),
            patch(
                "backend.services.tierlist_service.minio_service.get_presigned_url",
                side_effect=lambda k: f"http://minio/{k}",
            ),
        ):
            options = await service.get_manga_cover_options(str(mid))
            assert len(options) == 2
            assert options[0].minio_key == shared_key
            assert options[0].is_default is True
            assert options[0].cover_art_id == str(cov1_id)
            assert options[0].volume == "1"
            assert options[1].minio_key == vol2_key
            assert options[1].is_default is False

    asyncio.run(_run())


def test_update_manga_custom_cover_does_not_overwrite_shared_cover_art():
    from backend.models.manga import MangaUpdate
    from backend.services.manga_service import MangaService

    async def _run():
        service = MangaService()
        mid = ObjectId()
        shared_cover_art_key = "cover-arts/dex-999/vol-1.jpg"
        existing_doc = {
            "_id": mid,
            "title": "Test Manga",
            "minio_cover_key": shared_cover_art_key,
        }

        fake_coll = MagicMock()
        fake_coll.find_one = AsyncMock(
            side_effect=[
                existing_doc,
                {**existing_doc, "minio_cover_key": f"covers/{mid}.jpg"},
            ]
        )
        fake_coll.update_one = AsyncMock()

        with (
            patch.object(service, "_get_mangas_collection", return_value=fake_coll),
            patch.object(service, "log_action", new=AsyncMock()),
            patch("backend.services.manga_service.minio_service.upload_cover") as mock_upload,
            patch(
                "backend.services.manga_service.minio_service.get_presigned_url",
                side_effect=lambda k: f"http://minio/{k}",
            ),
            patch("backend.services.manga_service.delete_cache", new=AsyncMock()),
            patch("backend.services.manga_service.delete_cache_pattern", new=AsyncMock()),
        ):
            res = await service.update_manga(str(mid), MangaUpdate(), new_cover_file=b"new_cover_bytes")
            expected_custom_key = f"covers/{mid}.jpg"
            mock_upload.assert_called_once_with(expected_custom_key, b"new_cover_bytes")
            assert res["minio_cover_key"] == expected_custom_key

    asyncio.run(_run())
