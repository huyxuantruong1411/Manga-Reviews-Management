"""
base.py - Base OCR Protocol, hints, and results for Vision Pipeline V3.
"""

from typing import List, Optional, Protocol

import numpy as np
from pydantic import BaseModel, Field

from backend.services.vision.types import OCRSpan


class OCRHints(BaseModel):
    expected_scripts: Optional[List[str]] = None
    expected_languages: Optional[List[str]] = None
    orientation: str = "horizontal"
    region_role: str = "dialogue"
    quality_profile: str = "balanced"


class OCRResult(BaseModel):
    spans: List[OCRSpan] = Field(default_factory=list)
    full_raw_text: str = ""
    confidence: float = 1.0
    engine: str = "rapidocr"
    model_version: str = "ppocr-v4"


class OCREngine(Protocol):
    def recognize(
        self,
        img: np.ndarray,
        hints: Optional[OCRHints] = None,
    ) -> OCRResult:
        """Recognize text in an image crop and return structured OCR result."""
        ...
