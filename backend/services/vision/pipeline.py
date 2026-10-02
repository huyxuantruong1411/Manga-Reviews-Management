"""
pipeline.py - Master orchestrator for Manga Reviews Management Vision Pipeline V3.
"""

import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

import cv2
import numpy as np

from backend.services.vision.layout.model_registry import layout_registry
from backend.services.vision.nlp.router import nlp_router
from backend.services.vision.ocr.language_router import language_router
from backend.services.vision.ocr.ppocr import ppocr_engine
from backend.services.vision.ocr.script_detector import script_detector
from backend.services.vision.page_classifier import page_classifier
from backend.services.vision.reading_order.kovanen import kovanen_order_estimator
from backend.services.vision.text.association import region_associator
from backend.services.vision.text.normalizer import text_normalizer
from backend.services.vision.text.text_role import text_role_classifier
from backend.services.vision.types import (
    AnalysisWarning,
    LayoutRegion,
    PageAnalysis,
    PageAnalysisContext,
    StageTiming,
    TextRegionAnalysis,
)

logger = logging.getLogger("vision_pipeline_v3")


class VisionPipelineV3:
    """
    Complete V3 vision pipeline coordinating layout segmentation, reading order,
    region association, conservative OCR normalization, script routing, and NLP.
    """

    def analyze_page(
        self,
        image_bytes: bytes,
        context: PageAnalysisContext,
        options: Optional[Dict[str, Any]] = None,
    ) -> PageAnalysis:
        opts = options or {}
        timings = StageTiming()
        warnings: List[AnalysisWarning] = []
        t0 = time.perf_counter()

        # 1. Decode image bytes
        t_decode_start = time.perf_counter()
        img = self.decode_image_bytes(image_bytes)
        timings.decode_ms = round((time.perf_counter() - t_decode_start) * 1000, 2)

        if img is None:
            warnings.append(AnalysisWarning(code="DECODE_FAILED", message="Failed to decode image bytes"))
            return PageAnalysis(
                id=str(uuid4()),
                manga_id=context.manga_id,
                chapter_id=context.chapter_id,
                page_number=context.page_number,
                page_minio_key="",
                page_hash=context.page_hash,
                width=context.image_width,
                height=context.image_height,
                warnings=warnings,
                timings=timings,
            )

        height, width = img.shape[:2]

        # 2. Semantic Layout Analysis
        t_layout_start = time.perf_counter()
        layout_backend = opts.get("layout_backend", "semantic")
        layout_analyzer = layout_registry.get_analyzer(layout_backend)
        layout_regions = layout_analyzer.analyze_layout(img, context)

        frames: List[LayoutRegion] = [r for r in layout_regions if r.kind == "frame"]
        balloons: List[LayoutRegion] = [r for r in layout_regions if r.kind == "balloon"]
        timings.layout_ms = round((time.perf_counter() - t_layout_start) * 1000, 2)

        # 3. Reading Order Estimation (Kovanen recursive partition)
        frames = kovanen_order_estimator.sort_regions(frames, direction=context.reading_direction)
        balloons = kovanen_order_estimator.sort_regions(balloons, direction=context.reading_direction)

        # 4. Page Classification Gate
        page_type, index_for_search, index_for_vocab = page_classifier.classify_page(
            img,
            context=context,
            frame_count=len(frames),
            text_count=len(balloons),
        )

        if page_type == "cover":
            warnings.append(
                AnalysisWarning(
                    code="PAGE_IS_COVER",
                    message="Page classified as cover; vocabulary indexing disabled to protect lexicon",
                )
            )

        # 5. Region-Level OCR
        t_ocr_start = time.perf_counter()
        ocr_result = ppocr_engine.recognize(img)
        timings.ocr_ms = round((time.perf_counter() - t_ocr_start) * 1000, 2)

        # 6. Region Association, Normalization, Role Classification, and NLP
        t_post_start = time.perf_counter()
        texts: List[TextRegionAnalysis] = []

        text_idx = 0
        for span in ocr_result.spans:
            # Associate text with parent balloon and parent frame
            panel_id, balloon_id, assoc_conf = region_associator.associate_text(span.bbox, frames, balloons)

            # Classify text role
            role = text_role_classifier.classify_role(
                span.text_raw,
                bbox=span.bbox,
                has_balloon=bool(balloon_id),
                has_frame=bool(panel_id),
                page_type=page_type,
            )

            # Script detection & Language routing
            script, script_conf = script_detector.detect_script(span.text_raw)
            routed_lang, routed_script = language_router.route_language(
                span.text_raw,
                detected_script=script,
                chapter_language=context.chapter_language,
                original_language=context.manga_original_language,
            )

            # Conservative normalization (never alters raw OCR!)
            norm_res = text_normalizer.normalize(
                span.text_raw,
                language=routed_lang,
                enable_wordninja=opts.get("enable_wordninja", True),
            )

            clean_text = norm_res.corrected_text or norm_res.normalized_text

            # NLP Tokenization (only if index_for_vocab is True and text role is dialogue or narration)
            tokens = []
            if index_for_vocab and role in ("dialogue", "narration"):
                tokens = nlp_router.analyze(
                    clean_text,
                    language=routed_lang,
                    source_region_id=span.id,
                )

            overall_conf = round(span.confidence * assoc_conf, 3)

            texts.append(
                TextRegionAnalysis(
                    id=str(uuid4()),
                    panel_region_id=panel_id,
                    balloon_region_id=balloon_id,
                    bbox=span.bbox,
                    polygon=span.polygon,
                    text_role=role,
                    reading_order=text_idx,
                    ocr_raw=span.text_raw,
                    normalized_text=norm_res.normalized_text,
                    corrected_text=norm_res.corrected_text,
                    confidence=overall_conf,
                    ocr_engine=span.engine,
                    script=routed_script,
                    language=routed_lang,
                    corrections=norm_res.corrections,
                    tokens=tokens,
                )
            )
            text_idx += 1

        timings.postprocess_ms = round((time.perf_counter() - t_post_start) * 1000, 2)
        timings.total_ms = round((time.perf_counter() - t0) * 1000, 2)

        return PageAnalysis(
            id=str(uuid4()),
            manga_id=context.manga_id,
            chapter_id=context.chapter_id,
            page_number=context.page_number,
            page_minio_key="",
            page_hash=context.page_hash,
            analysis_version=3,
            page_type=page_type,
            index_for_search=index_for_search,
            index_for_vocabulary=index_for_vocab,
            width=width,
            height=height,
            reading_direction=context.reading_direction,
            models={
                "layout": layout_backend,
                "ocr": "rapidocr-ppocr-v4",
                "nlp": "spacy-en-core-web-sm",
            },
            frames=frames,
            balloons=balloons,
            texts=texts,
            timings=timings,
            warnings=warnings,
            created_at=datetime.utcnow(),
        )

    def decode_image_bytes(self, image_bytes: bytes) -> Optional[np.ndarray]:
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            return img
        except Exception as e:
            logger.error(f"Error decoding image bytes: {e}")
            return None


vision_pipeline_v3 = VisionPipelineV3()
