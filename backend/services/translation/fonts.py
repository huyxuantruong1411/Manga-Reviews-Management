"""Translation Font Pack and Vietnamese Glyph Coverage Service.

Parses TrueType (TTF) and OpenType (OTF) binary cmap tables to verify Vietnamese
glyph coverage, manages font pack registries, and persists font assets.
"""

import hashlib
import logging
import os
import struct
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import backend.database.connection as db_conn
from backend.models.translation import TranslationAssetInDB, TranslationFontPack

logger = logging.getLogger("backend.translation.fonts")

# Standard test sentence and essential Vietnamese characters
VIETNAMESE_TEST_STRING = "Đường phố vẫn sáng, nhưng lòng tôi đã đổi khác. Ừ, hãy bắt đầu!"
VIETNAMESE_ALPHABET = (
    "aàảãáạăằẳẵắặâầẩẫấậeèẻẽéẹêềểễếệiìỉĩíịoòỏõóọôồổỗốộơờởỡớợuùủũúụưừửữứựyỳỷỹýỵdđ"
    "AÀẢÃÁẠĂẰẮẲẴẶÂẦẨẪẤẬEÈẺẼÉẸÊỀỂỄẾỆIÌỈĨÍỊOÒỎÕÓỌÔỒỔỖỐỘƠỜỞỠỚỢUÙỦŨÚỤƯỪỬỮỨỰYỲỶỸÝỴDĐ"
)


def extract_ttf_codepoints(font_bytes: bytes) -> Set[int]:
    """Extracts supported Unicode codepoints from TTF/OTF bytes using pure-Python cmap parsing."""
    if len(font_bytes) < 12:
        return set()

    scaler_type = font_bytes[:4]
    # Valid signatures: 0x00010000, 'true', 'typ1', 'OTTO'
    if scaler_type not in (b"\x00\x01\x00\x00", b"true", b"typ1", b"OTTO"):
        return set()

    try:
        (num_tables,) = struct.unpack(">H", font_bytes[4:6])
        cmap_offset = None
        for i in range(num_tables):
            entry_offset = 12 + i * 16
            tag = font_bytes[entry_offset : entry_offset + 4]
            if tag == b"cmap":
                (cmap_offset,) = struct.unpack(">I", font_bytes[entry_offset + 8 : entry_offset + 12])
                break

        if not cmap_offset or cmap_offset + 4 > len(font_bytes):
            return set()

        num_subtables = struct.unpack(">H", font_bytes[cmap_offset + 2 : cmap_offset + 4])[0]
        codepoints = set()

        for j in range(num_subtables):
            sub_rec_offset = cmap_offset + 4 + j * 8
            if sub_rec_offset + 8 > len(font_bytes):
                break
            platform_id, encoding_id, sub_offset = struct.unpack(
                ">HHI", font_bytes[sub_rec_offset : sub_rec_offset + 8]
            )
            table_start = cmap_offset + sub_offset
            if table_start + 6 > len(font_bytes):
                continue

            format_id = struct.unpack(">H", font_bytes[table_start : table_start + 2])[0]

            # Format 4: Segment mapping for BMP (0x0000 to 0xFFFF)
            if format_id == 4:
                length, language, seg_count_x2 = struct.unpack(">HHH", font_bytes[table_start + 2 : table_start + 8])
                seg_count = seg_count_x2 // 2
                end_codes_offset = table_start + 14
                start_codes_offset = end_codes_offset + seg_count * 2 + 2

                if start_codes_offset + seg_count * 2 <= len(font_bytes):
                    end_codes = struct.unpack(
                        f">{seg_count}H", font_bytes[end_codes_offset : end_codes_offset + seg_count * 2]
                    )
                    start_codes = struct.unpack(
                        f">{seg_count}H", font_bytes[start_codes_offset : start_codes_offset + seg_count * 2]
                    )
                    for start, end in zip(start_codes, end_codes, strict=False):
                        if end == 0xFFFF and start == 0xFFFF:
                            continue
                        for code in range(start, end + 1):
                            codepoints.add(code)

            # Format 12: Segmented coverage for full Unicode
            elif format_id == 12:
                if table_start + 16 <= len(font_bytes):
                    n_groups = struct.unpack(">I", font_bytes[table_start + 12 : table_start + 16])[0]
                    groups_offset = table_start + 16
                    for g in range(n_groups):
                        grp_offset = groups_offset + g * 12
                        if grp_offset + 8 <= len(font_bytes):
                            start_char, end_char = struct.unpack(">II", font_bytes[grp_offset : grp_offset + 8])
                            for code in range(start_char, end_char + 1):
                                codepoints.add(code)

        return codepoints
    except Exception as e:
        logger.warning(f"Error parsing font cmap: {e}")
        return set()


def check_vietnamese_glyph_coverage(supported_codepoints: Set[int]) -> Tuple[bool, List[str], float]:
    """Checks whether the provided codepoints support all essential Vietnamese characters."""
    required_chars = set(VIETNAMESE_ALPHABET)
    missing = []
    for c in required_chars:
        if ord(c) not in supported_codepoints:
            missing.append(c)

    total_chars = len(required_chars)
    present_count = total_chars - len(missing)
    ratio = present_count / total_chars if total_chars > 0 else 1.0

    return (len(missing) == 0, sorted(missing), round(ratio, 4))


class TranslationFontService:
    async def list_fonts(self) -> List[Dict[str, Any]]:
        """Lists registered font packs, ensuring a default font exists."""
        db = db_conn.get_db()
        cursor = db["translation_font_packs"].find({})
        fonts = await cursor.to_list(length=50)

        if not fonts:
            default_pack = TranslationFontPack(
                font_pack_id="font-pack-default",
                name="Default Manga Sans (System/Fallback)",
                scope="local",
                variants=[{"style": "regular", "filename": "manga-default.ttf"}],
                vietnamese_coverage=True,
                missing_glyphs=[],
                license_note="Bundled open source fallback font",
                state="available",
            )
            await db["translation_font_packs"].insert_one(default_pack.model_dump(by_alias=True, exclude={"id"}))
            cursor = db["translation_font_packs"].find({})
            fonts = await cursor.to_list(length=50)

        for f in fonts:
            f.pop("_id", None)
        return fonts

    async def upload_font_pack(
        self,
        name: str,
        file_bytes: bytes,
        filename: str,
        license_note: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Validates font file bytes, verifies Vietnamese glyph coverage, and registers the pack."""
        from backend.services.translation.storage_service import translation_storage_service

        if len(file_bytes) < 12:
            raise ValueError("Invalid font format: file too small")

        # Validate magic header bytes
        scaler = file_bytes[:4]
        if scaler not in (b"\x00\x01\x00\x00", b"true", b"typ1", b"OTTO"):
            raise ValueError("Invalid font format: must be TrueType (.ttf) or OpenType (.otf)")

        sha256 = hashlib.sha256(file_bytes).hexdigest()
        ext = os.path.splitext(filename)[1].lower() or ".ttf"
        object_key = f"translation/fonts/{sha256}{ext}"

        # 1. Upload font binary to MinIO
        content_type = "font/otf" if ext == ".otf" else "font/ttf"
        await translation_storage_service.upload_file(object_key, file_bytes, content_type)

        # 2. Extract glyphs & check coverage
        codepoints = extract_ttf_codepoints(file_bytes)
        is_covered, missing, coverage_ratio = check_vietnamese_glyph_coverage(codepoints)

        db = db_conn.get_db()
        now = datetime.now(timezone.utc)

        # 3. Register asset
        asset_id = str(uuid.uuid4())
        asset = TranslationAssetInDB(
            asset_id=asset_id,
            scope="local",
            kind="font",
            object_key=object_key,
            sha256=sha256,
            file_size=len(file_bytes),
            mime_type=content_type,
            state="available",
            created_at=now,
        )
        await db["translation_assets"].insert_one(asset.model_dump(by_alias=True, exclude={"id"}))

        # 4. Register font pack
        font_pack_id = str(uuid.uuid4())
        font_pack = TranslationFontPack(
            font_pack_id=font_pack_id,
            name=name,
            scope="local",
            variants=[{"style": "regular", "filename": filename, "object_key": object_key, "asset_id": asset_id}],
            vietnamese_coverage=is_covered,
            missing_glyphs=missing,
            license_note=license_note,
            state="available",
            created_at=now,
        )
        pack_dict = font_pack.model_dump(by_alias=True, exclude={"id"})
        await db["translation_font_packs"].insert_one(pack_dict)

        pack_dict.pop("_id", None)
        return pack_dict


translation_font_service = TranslationFontService()
