"""Lossless Manga Storage Optimization Utilities.

Provides:
1. ``MangaMatrixContainer`` (.mgtile): 2D tile-deduplicated + Zstandard container
   for archival manga chapters (based on ``Tối Ưu Lưu Trữ Manga MinIO.md``).
2. ``optimize_png_bytes_to_webp_lossless``: 100% pixel-exact PNG -> WebP Lossless (VP8L)
   converter with mathematical MSE=0 (``np.array_equal``) verification and size guard.
3. ``inspect_png_ihdr``: Zero-decode 29-byte PNG IHDR header inspector.
"""

from __future__ import annotations

import hashlib
import io
import json
import struct
import zlib
from typing import Any

import numpy as np
from PIL import Image

try:
    import zstandard as _zstd  # type: ignore[import-not-found]
except ImportError:
    _zstd = None

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
WEBP_RIFF_MAGIC = b"RIFF"
WEBP_FOURCC = b"WEBP"
MGTILE_MAGIC = b"MGTL\x01"


def inspect_png_ihdr(raw_bytes: bytes) -> dict[str, int] | None:
    """Parse PNG IHDR chunk without decoding image pixels.

    color_type values:
      0 = Grayscale (L)
      2 = Truecolor (RGB)
      3 = Indexed-color (P)
      4 = Grayscale + Alpha (LA)
      6 = Truecolor + Alpha (RGBA)
    """
    if len(raw_bytes) < 29 or raw_bytes[:8] != PNG_SIGNATURE:
        return None
    if raw_bytes[12:16] != b"IHDR":
        return None
    width, height, bit_depth, color_type, comp, filt, interlace = struct.unpack(">IIBBBBB", raw_bytes[16:29])
    return {
        "width": width,
        "height": height,
        "bit_depth": bit_depth,
        "color_type": color_type,
        "compression": comp,
        "filter": filt,
        "interlace": interlace,
    }


def optimize_png_bytes_to_webp_lossless(
    raw_bytes: bytes,
    *,
    method: int = 2,
    quality: int = 80,
    verify_pixels: bool = True,
    min_savings_bytes: int = 1,
    min_savings_ratio: float = 0.0,
) -> tuple[bytes, bool]:
    """Convert PNG bytes to WebP Lossless (VP8L) if and only if strictly smaller and pixel-exact.

    Non-PNG inputs (such as JPEG or existing WebP) are returned untouched ``(raw_bytes, False)``
    to prevent generational loss or format inflation.
    """
    orig_len = len(raw_bytes)
    if orig_len < 29 or raw_bytes[:8] != PNG_SIGNATURE:
        return raw_bytes, False

    with Image.open(io.BytesIO(raw_bytes)) as src_img:
        buf = io.BytesIO()
        src_img.save(buf, format="WEBP", lossless=True, quality=quality, method=method)
        webp_bytes = buf.getvalue()

        saved = orig_len - len(webp_bytes)
        if saved < min_savings_bytes or (min_savings_ratio > 0.0 and (saved / orig_len) < min_savings_ratio):
            return raw_bytes, False

        if verify_pixels:
            has_alpha = src_img.mode in ("RGBA", "LA") or (src_img.mode == "P" and "transparency" in src_img.info)
            compare_mode = "RGBA" if has_alpha else "RGB"
            orig_arr = np.asarray(src_img.convert(compare_mode))
            with Image.open(io.BytesIO(webp_bytes)) as dec_img:
                dec_arr = np.asarray(dec_img.convert(compare_mode))
            if not np.array_equal(orig_arr, dec_arr):
                return raw_bytes, False

    return webp_bytes, True


class MangaMatrixContainer:
    """Block-level 2D tile deduplication + Zstandard container (.mgtile).

    Splits chapter pages into ``tile_size x tile_size`` blocks, deduplicates identical
    tiles across the chapter via Blake2b-128 hashing, and compresses the tile pool
    and page coordinate matrices with Zstandard.
    """

    def __init__(self, tile_size: int = 16, zstd_level: int = 9) -> None:
        if tile_size <= 0:
            raise ValueError("tile_size must be positive")
        self.tile_size = tile_size
        self.zstd_level = zstd_level

    def pack_pages(self, pages: list[np.ndarray]) -> tuple[bytes, dict[str, Any]]:
        """Pack a list of 2D (grayscale) or 3D (RGB/RGBA) numpy page arrays into a .mgtile blob."""
        unique_tiles: dict[bytes, int] = {}
        tile_pool: list[bytes] = []
        pages_meta: list[dict[str, Any]] = []
        total_tiles = 0

        for idx, img in enumerate(pages):
            if img.ndim == 2:
                h, w = img.shape
                channels = 1
                work = img[:, :, np.newaxis]
            elif img.ndim == 3:
                h, w, channels = img.shape
                work = img
            else:
                raise ValueError(f"Unsupported page array ndim={img.ndim}")

            pad_h = (self.tile_size - (h % self.tile_size)) % self.tile_size
            pad_w = (self.tile_size - (w % self.tile_size)) % self.tile_size
            if pad_h > 0 or pad_w > 0:
                padded = np.pad(
                    work,
                    ((0, pad_h), (0, pad_w), (0, 0)),
                    mode="constant",
                    constant_values=255,
                )
            else:
                padded = work

            H_pad, W_pad, _ = padded.shape
            grid_h = H_pad // self.tile_size
            grid_w = W_pad // self.tile_size

            # Reshape into (grid_h, grid_w, tile_size, tile_size, channels)
            tiles = padded.reshape(grid_h, self.tile_size, grid_w, self.tile_size, channels).swapaxes(1, 2)

            grid_indices: list[int] = []
            for r in range(grid_h):
                for c in range(grid_w):
                    t_bytes = tiles[r, c].tobytes()
                    t_hash = hashlib.blake2b(t_bytes, digest_size=16).digest()
                    t_id = unique_tiles.get(t_hash)
                    if t_id is None:
                        t_id = len(tile_pool)
                        unique_tiles[t_hash] = t_id
                        tile_pool.append(t_bytes)
                    grid_indices.append(t_id)

            total_tiles += len(grid_indices)
            pages_meta.append(
                {
                    "page": idx,
                    "w": int(w),
                    "h": int(h),
                    "pw": int(W_pad),
                    "ph": int(H_pad),
                    "c": int(channels),
                    "grid": grid_indices,
                }
            )

        header_bytes = json.dumps({"tile_size": self.tile_size, "pages": pages_meta}, separators=(",", ":")).encode(
            "utf-8"
        )
        raw_pool = b"".join(tile_pool)
        if _zstd is not None:
            cctx = _zstd.ZstdCompressor(level=self.zstd_level)
            comp_header = cctx.compress(header_bytes)
            comp_pool = cctx.compress(raw_pool)
        else:
            lvl = max(1, min(9, self.zstd_level))
            comp_header = zlib.compress(header_bytes, level=lvl)
            comp_pool = zlib.compress(raw_pool, level=lvl)

        out = io.BytesIO()
        out.write(MGTILE_MAGIC)
        out.write(struct.pack("<I", len(comp_header)))
        out.write(comp_header)
        out.write(comp_pool)

        blob = out.getvalue()
        stats = {
            "total_pages": len(pages),
            "total_tiles": total_tiles,
            "unique_tiles": len(tile_pool),
            "compressed_bytes": len(blob),
        }
        return blob, stats

    def extract_page(self, container_bytes: bytes, page_index: int) -> np.ndarray:
        """Reconstruct the exact original numpy array for ``page_index`` from a .mgtile blob."""
        if len(container_bytes) < 9 or container_bytes[:5] != MGTILE_MAGIC:
            raise ValueError("Invalid MGTL container header")

        header_len = struct.unpack("<I", container_bytes[5:9])[0]
        comp_header = container_bytes[9 : 9 + header_len]
        comp_pool = container_bytes[9 + header_len :]

        if _zstd is not None and comp_header.startswith(b"\x28\xb5\x2f\xfd"):
            dctx = _zstd.ZstdDecompressor()
            header = json.loads(dctx.decompress(comp_header).decode("utf-8"))
            raw_pool = dctx.decompress(comp_pool)
        else:
            header = json.loads(zlib.decompress(comp_header).decode("utf-8"))
            raw_pool = zlib.decompress(comp_pool)

        t_size = int(header["tile_size"])
        p_meta = header["pages"][page_index]
        w, h = int(p_meta["w"]), int(p_meta["h"])
        pw, ph = int(p_meta["pw"]), int(p_meta["ph"])
        channels = int(p_meta.get("c", 1))
        grid = p_meta["grid"]

        pool_arr = np.frombuffer(raw_pool, dtype=np.uint8).reshape(-1, t_size, t_size, channels)

        grid_h = ph // t_size
        grid_w = pw // t_size
        selected = pool_arr[np.asarray(grid, dtype=np.int32)].reshape(grid_h, grid_w, t_size, t_size, channels)
        reconstructed = selected.swapaxes(1, 2).reshape(ph, pw, channels)[:h, :w, :]
        if channels == 1:
            return reconstructed[:, :, 0].copy()
        return reconstructed.copy()
