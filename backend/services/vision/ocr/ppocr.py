"""
ppocr.py - RapidOCR / PP-OCR engine adapter implementing OCREngine.
"""

import logging
from typing import List, Optional
from uuid import uuid4

import numpy as np
from rapidocr_onnxruntime import RapidOCR

from backend.services.vision.ocr.base import OCREngine, OCRHints, OCRResult
from backend.services.vision.ocr.script_detector import script_detector
from backend.services.vision.types import OCRSpan

logger = logging.getLogger("ppocr_engine")


class PPOCREngine(OCREngine):
    """
    Adapter wrapping RapidOCR (PP-OCRv4 / PP-OCRv6 ONNX).
    """

    def __init__(self, model_version: str = "ppocr-v4"):
        self.model_version = model_version
        self._engine: Optional[RapidOCR] = None

    @property
    def engine(self) -> RapidOCR:
        if self._engine is None:
            logger.info("Initializing RapidOCR engine...")
            self._engine = RapidOCR()
        return self._engine

    def recognize(
        self,
        img: np.ndarray,
        hints: Optional[OCRHints] = None,
    ) -> OCRResult:
        if img is None or img.size == 0:
            return OCRResult(spans=[], full_raw_text="", confidence=0.0)

        height, width = img.shape[:2]
        try:
            raw_output, _ = self.engine(img)
        except Exception as e:
            logger.error(f"RapidOCR error during recognition: {e}")
            return OCRResult(spans=[], full_raw_text="", confidence=0.0)

        if not raw_output:
            return OCRResult(spans=[], full_raw_text="", confidence=1.0)

        spans: List[OCRSpan] = []
        text_lines: List[str] = []
        conf_sum = 0.0

        for item in raw_output:
            pts = np.array(item[0])
            text = str(item[1]).strip()
            conf = float(item[2])

            if not text:
                continue

            px1 = float(np.min(pts[:, 0]))
            py1 = float(np.min(pts[:, 1]))
            px2 = float(np.max(pts[:, 0]))
            py2 = float(np.max(pts[:, 1]))

            nx1 = max(0.0, min(1.0, px1 / width))
            ny1 = max(0.0, min(1.0, py1 / height))
            nx2 = max(0.0, min(1.0, px2 / width))
            ny2 = max(0.0, min(1.0, py2 / height))

            script, _ = script_detector.detect_script(text)

            span = OCRSpan(
                id=str(uuid4()),
                text_raw=text,
                confidence=conf,
                bbox=(nx1, ny1, nx2, ny2),
                polygon=[(float(p[0]) / width, float(p[1]) / height) for p in pts],
                orientation="horizontal" if (px2 - px1) >= (py2 - py1) else "vertical",
                engine="rapidocr",
                model_version=self.model_version,
                script=script,
            )
            spans.append(span)
            text_lines.append(text)
            conf_sum += conf

        avg_conf = (conf_sum / len(spans)) if spans else 0.0
        full_text = "\n".join(text_lines)

        return OCRResult(
            spans=spans,
            full_raw_text=full_text,
            confidence=avg_conf,
            engine="rapidocr",
            model_version=self.model_version,
        )


ppocr_engine = PPOCREngine()
