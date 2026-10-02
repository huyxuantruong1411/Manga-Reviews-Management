"""
manga_ocr_ja.py - Optional MangaOCR engine adapter for Japanese fallback.
"""

import logging
from typing import Optional

import numpy as np
from PIL import Image

from backend.services.vision.ocr.base import OCREngine, OCRHints, OCRResult
from backend.services.vision.types import OCRSpan

logger = logging.getLogger("manga_ocr_ja")


class JapaneseMangaOCREngine(OCREngine):
    """
    Adapter for `manga-ocr` library (specialized Japanese manga text model).
    Loaded lazily and invoked only for confirmed Japanese text crops when confidence is low.
    """

    def __init__(self):
        self._mocr = None
        self._loaded = False

    def _ensure_loaded(self) -> bool:
        if not self._loaded:
            self._loaded = True
            try:
                from manga_ocr import MangaOcr

                self._mocr = MangaOcr()
                logger.info("MangaOCR Japanese engine initialized successfully.")
            except ImportError:
                logger.info("manga-ocr is not installed; Japanese fallback will use PP-OCR.")
            except Exception as e:
                logger.warning(f"Failed to load MangaOCR: {e}")
        return self._mocr is not None

    def recognize(
        self,
        img: np.ndarray,
        hints: Optional[OCRHints] = None,
    ) -> OCRResult:
        if not self._ensure_loaded() or img is None or img.size == 0:
            return OCRResult(spans=[], full_raw_text="", confidence=0.0, engine="manga-ocr-disabled")

        try:
            pil_img = Image.fromarray(img)
            text = self._mocr(pil_img).strip()
            return OCRResult(
                spans=[
                    OCRSpan(
                        id="ja-0",
                        text_raw=text,
                        confidence=0.90,
                        bbox=(0.0, 0.0, 1.0, 1.0),
                        engine="manga-ocr",
                        model_version="1.0",
                        script="hiragana",
                        language="ja",
                    )
                ],
                full_raw_text=text,
                confidence=0.90,
                engine="manga-ocr",
                model_version="1.0",
            )
        except Exception as e:
            logger.error(f"Error during MangaOCR inference: {e}")
            return OCRResult(spans=[], full_raw_text="", confidence=0.0, engine="manga-ocr")


japanese_ocr_engine = JapaneseMangaOCREngine()
