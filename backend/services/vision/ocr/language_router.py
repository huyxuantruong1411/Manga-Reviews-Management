"""
language_router.py - Determines region-level natural language and NLP processor routing.
"""

from typing import Optional, Tuple

from backend.services.vision.ocr.script_detector import script_detector
from backend.services.vision.types import ScriptType

VIETNAMESE_DIACRITICS = set("àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ")


class LanguageRouter:
    """
    Routes OCR text to the appropriate NLP pipeline and language model.
    Guarantees that non-Latin / CJK scripts never pollute English spaCy!
    """

    def route_language(
        self,
        text: str,
        detected_script: Optional[ScriptType] = None,
        chapter_language: Optional[str] = None,
        original_language: Optional[str] = None,
    ) -> Tuple[str, ScriptType]:
        """
        Returns (language_code, script_type).
        """
        if not text or not text.strip():
            return (chapter_language or "en"), "unknown"

        if detected_script is None or detected_script == "unknown":
            detected_script, _ = script_detector.detect_script(text)

        # 1. CJK / Japanese scripts
        if detected_script in ("hiragana", "katakana"):
            return "ja", detected_script

        if detected_script == "han":
            # If original language was Chinese, prioritize 'zh', else default manga CJK is 'ja'
            if original_language and original_language.lower().startswith("zh"):
                return "zh", "han"
            return "ja", "han"

        if detected_script == "hangul":
            return "ko", "hangul"

        if detected_script == "mixed":
            # Mixed usually means manga with Kanji + Furigana or English + Japanese
            # Check if any Japanese chars are present
            has_kana = any((0x3040 <= ord(c) <= 0x30FF) for c in text)
            if has_kana:
                return "ja", "mixed"
            return (chapter_language or "en"), "mixed"

        # 2. Latin scripts: distinguish English vs Vietnamese
        if detected_script == "latin":
            # Check for Vietnamese diacritics
            has_vi_diacritics = any(c in VIETNAMESE_DIACRITICS for c in text)
            if has_vi_diacritics or (chapter_language and chapter_language.lower() == "vi"):
                return "vi", "latin"
            return "en", "latin"

        # Default fallback: honor chapter language prior
        return (chapter_language or "en"), detected_script


language_router = LanguageRouter()
