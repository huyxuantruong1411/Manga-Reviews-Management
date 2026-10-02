"""
OCR package for Vision Pipeline V3.
"""

from backend.services.vision.ocr.base import OCREngine, OCRHints, OCRResult
from backend.services.vision.ocr.language_router import LanguageRouter, language_router
from backend.services.vision.ocr.manga_ocr_ja import JapaneseMangaOCREngine, japanese_ocr_engine
from backend.services.vision.ocr.ppocr import PPOCREngine, ppocr_engine
from backend.services.vision.ocr.script_detector import ScriptDetector, script_detector

__all__ = [
    "OCREngine",
    "OCRHints",
    "OCRResult",
    "PPOCREngine",
    "ppocr_engine",
    "JapaneseMangaOCREngine",
    "japanese_ocr_engine",
    "ScriptDetector",
    "script_detector",
    "LanguageRouter",
    "language_router",
]
