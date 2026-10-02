"""
types.py - Vision Pipeline V3 core type definitions and Pydantic schemas.
"""

from datetime import datetime
from typing import Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel, Field

PageType = Literal[
    "story",
    "cover",
    "toc",
    "credits",
    "afterword",
    "editorial",
    "blank",
    "unknown",
]

ReadingDirection = Literal["rtl", "ltr"]

RegionKind = Literal["frame", "text", "balloon"]

TextRole = Literal[
    "dialogue",
    "narration",
    "sfx",
    "sign",
    "title",
    "credits",
    "editorial",
    "unknown",
]

ScriptType = Literal[
    "latin",
    "hiragana",
    "katakana",
    "han",
    "hangul",
    "mixed",
    "numeric_symbol",
    "unknown",
]


class PageAnalysisContext(BaseModel):
    manga_id: str
    chapter_id: str
    page_number: int
    page_hash: str
    image_width: int
    image_height: int
    manga_original_language: Optional[str] = None
    chapter_language: Optional[str] = None
    requested_language: str = "auto"
    reading_direction: ReadingDirection = "rtl"


class LayoutRegion(BaseModel):
    id: str
    kind: RegionKind
    bbox: Tuple[float, float, float, float]  # Normalized: (x1, y1, x2, y2) in [0.0, 1.0]
    polygon: Optional[List[Tuple[float, float]]] = None
    confidence: float = 1.0
    reading_order: int = 0
    model_name: str = "default"
    model_version: str = "1.0"


class OCRSpan(BaseModel):
    id: str
    text_raw: str
    confidence: float
    bbox: Tuple[float, float, float, float]
    polygon: Optional[List[Tuple[float, float]]] = None
    orientation: Literal["horizontal", "vertical", "unknown"] = "horizontal"
    engine: str = "rapidocr"
    model_version: str = "ppocr-v4"
    script: Optional[ScriptType] = None
    language: Optional[str] = None


class Correction(BaseModel):
    type: str
    before: str
    after: Optional[str] = None
    confidence: float = 1.0
    reason: str


class LinguisticToken(BaseModel):
    surface: str
    lemma: str
    pos: str
    is_stopword: bool = False
    source_text_region_id: Optional[str] = None
    start_char: int = 0
    end_char: int = 0
    quality_score: float = 1.0


class TextRegionAnalysis(BaseModel):
    id: str
    region_type: Literal["text"] = "text"
    panel_region_id: Optional[str] = None
    balloon_region_id: Optional[str] = None
    bbox: Tuple[float, float, float, float]
    polygon: Optional[List[Tuple[float, float]]] = None
    text_role: TextRole = "dialogue"
    reading_order: int = 0
    ocr_raw: str
    normalized_text: str
    corrected_text: Optional[str] = None
    confidence: float = 1.0
    ocr_engine: str = "rapidocr"
    script: ScriptType = "latin"
    language: str = "en"
    corrections: List[Correction] = Field(default_factory=list)
    tokens: List[LinguisticToken] = Field(default_factory=list)


class StageTiming(BaseModel):
    decode_ms: float = 0.0
    layout_ms: float = 0.0
    ocr_ms: float = 0.0
    postprocess_ms: float = 0.0
    nlp_ms: float = 0.0
    total_ms: float = 0.0


class AnalysisWarning(BaseModel):
    code: str
    message: str
    region_id: Optional[str] = None


class PageAnalysis(BaseModel):
    id: str
    manga_id: str
    chapter_id: str
    page_number: int
    page_minio_key: str
    page_hash: str
    analysis_version: int = 3
    config_hash: str = ""
    page_type: PageType = "story"
    index_for_search: bool = True
    index_for_vocabulary: bool = True
    width: int
    height: int
    reading_direction: ReadingDirection = "rtl"
    models: Dict[str, str] = Field(default_factory=dict)
    frames: List[LayoutRegion] = Field(default_factory=list)
    balloons: List[LayoutRegion] = Field(default_factory=list)
    texts: List[TextRegionAnalysis] = Field(default_factory=list)
    timings: StageTiming = Field(default_factory=StageTiming)
    warnings: List[AnalysisWarning] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
