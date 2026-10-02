"""
panel_report_service.py – Technical Extraction & AI Optimization Report Generator.

Generates comprehensive, standalone reports (HTML with embedded Base64 images, or structured JSON)
documenting manga scene panel extraction, OCR text processing, vocabulary extraction, and the
entire underlying computer vision & NLP pipeline.

Designed for:
1. Human quality inspection and PDF archiving (via browser print).
2. Direct consumption by Multimodal AI Agents (Gemini, Claude, GPT) to evaluate pipeline fidelity,
   spot OCR/segmentation edge cases, and plan future model/rule optimizations.
"""

import asyncio
import base64
import html
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from backend.database.connection import get_db
from backend.services.minio_service import minio_service
from backend.services.vision_service import vision_service

logger = logging.getLogger("panel_report_service")


class PanelReportService:
    """Service generating comprehensive technical audit reports for panel extraction."""

    async def generate_report_data(
        self,
        manga_id: str,
        chapter_id: Optional[str] = None,
        scan_mode: Optional[str] = None,
        include_images: bool = True,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """
        Aggregate all metadata, extracted panel records, technical pipeline steps,
        and embedded image assets into a unified report dictionary.
        """
        db = get_db()
        m_filter = {"_id": ObjectId(manga_id)} if ObjectId.is_valid(manga_id) else {"_id": manga_id}
        manga = await db.mangas.find_one(m_filter)
        if not manga:
            # Fallback search by string id
            manga = await db.mangas.find_one({"_id": manga_id})
        if not manga:
            raise ValueError(f"Manga with ID '{manga_id}' not found.")

        # Resolve chapter info if filtered
        chapter_doc = None
        if chapter_id and chapter_id != "all":
            c_filter = {"_id": ObjectId(chapter_id)} if ObjectId.is_valid(chapter_id) else {"_id": chapter_id}
            chapter_doc = await db.chapters.find_one(c_filter)

        # Build query for manga_panels
        query: Dict[str, Any] = {"manga_id": str(manga["_id"])}
        if chapter_id and chapter_id != "all":
            query["chapter_id"] = str(chapter_doc["_id"]) if chapter_doc else chapter_id
        if scan_mode and scan_mode != "all":
            query["scan_mode"] = scan_mode

        # Fetch panels sorted by chapter_number, page_number, panel_index
        cursor = (
            db.manga_panels.find(query)
            .sort([("chapter_number", 1), ("page_number", 1), ("panel_index", 1)])
            .limit(limit)
        )
        panel_docs = await cursor.to_list(length=limit)

        total_matching_panels = await db.manga_panels.count_documents(query)

        # Cache page image bytes in memory during report generation
        page_cache: Dict[str, Optional[bytes]] = {}
        encoded_page_cache: Dict[str, Optional[str]] = {}

        def _fetch_page_bytes(obj_key: str) -> Optional[bytes]:
            if not obj_key:
                return None
            if obj_key in page_cache:
                return page_cache[obj_key]
            try:
                resp = minio_service.client.get_object(minio_service.bucket, obj_key)
                try:
                    data = resp.read()
                    page_cache[obj_key] = data
                    return data
                finally:
                    resp.close()
                    resp.release_conn()
            except Exception as e:
                logger.warning(f"Could not load page image from MinIO ({obj_key}): {e}")
                page_cache[obj_key] = None
                return None

        def _encode_original_page_image(page_bytes: bytes, max_width: int = 1200, quality: int = 75) -> str:
            """Encode intact original page image to Base64 data URL, optimizing dimensions if necessary."""
            try:
                import io

                from PIL import Image

                with Image.open(io.BytesIO(page_bytes)) as img:
                    if img.mode in ("RGBA", "LA", "P"):
                        img = img.convert("RGB")
                    if img.width > max_width:
                        new_height = int(img.height * (max_width / img.width))
                        img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
                    out_buf = io.BytesIO()
                    img.save(out_buf, format="JPEG", quality=quality, optimize=True)
                    b64_str = base64.b64encode(out_buf.getvalue()).decode("utf-8")
                    return f"data:image/jpeg;base64,{b64_str}"
            except Exception as pe:
                logger.warning(f"Error optimizing original page image: {pe}")
                b64_raw = base64.b64encode(page_bytes).decode("utf-8")
                return f"data:image/jpeg;base64,{b64_raw}"

        # Process each panel and embed crops if requested; group into pages
        processed_panels: List[Dict[str, Any]] = []
        pages_dict: Dict[str, Dict[str, Any]] = {}
        unique_vocabulary: Dict[str, Dict[str, Any]] = {}
        total_word_count = 0

        for doc in panel_docs:
            p_id = str(doc["_id"])
            coords = doc.get("coords", [0.0, 0.0, 1.0, 1.0])
            obj_key = doc.get("page_minio_key")
            raw_text = doc.get("raw_text", "")
            cleaned_text = doc.get("cleaned_text", "")
            vocab_list = doc.get("vocabulary", [])
            chap_id_str = str(doc.get("chapter_id", ""))
            page_num = doc.get("page_number", 1)

            # Build unique page key to group panels hierarchically
            page_id_key = f"{chap_id_str}_p{page_num}_{obj_key or 'unknown'}"
            if page_id_key not in pages_dict:
                original_page_data_url = None
                if include_images and obj_key:
                    if obj_key in encoded_page_cache:
                        original_page_data_url = encoded_page_cache[obj_key]
                    else:
                        page_bytes = await asyncio.to_thread(_fetch_page_bytes, obj_key)
                        if page_bytes:
                            original_page_data_url = await asyncio.to_thread(_encode_original_page_image, page_bytes)
                        encoded_page_cache[obj_key] = original_page_data_url

                pages_dict[page_id_key] = {
                    "page_key": page_id_key,
                    "chapter_id": chap_id_str,
                    "chapter_number": doc.get("chapter_number", ""),
                    "chapter_title": doc.get("chapter_title", ""),
                    "volume": doc.get("volume"),
                    "page_number": page_num,
                    "page_minio_key": obj_key,
                    "original_image_data_url": original_page_data_url,
                    "panels_count": 0,
                    "panels": [],
                }

            # Count words
            words = (cleaned_text or raw_text).split()
            total_word_count += len(words)

            for item in vocab_list:
                lemma = item.get("lemma") or item.get("term", "").lower()
                if lemma:
                    if lemma not in unique_vocabulary:
                        unique_vocabulary[lemma] = {
                            "term": item.get("term", lemma),
                            "lemma": lemma,
                            "pos_tag": item.get("pos_tag", "UNKNOWN"),
                            "frequency": 0,
                        }
                    unique_vocabulary[lemma]["frequency"] += item.get("frequency", 1)

            # Generate base64 crop image
            image_data_url = None
            if include_images and obj_key:
                page_bytes = await asyncio.to_thread(_fetch_page_bytes, obj_key)
                if page_bytes:
                    try:
                        crop_stream = await asyncio.to_thread(
                            vision_service.get_panel_crop_stream,
                            page_bytes,
                            tuple(coords),
                            75,
                        )
                        crop_bytes = crop_stream.getvalue()
                        b64_str = base64.b64encode(crop_bytes).decode("utf-8")
                        image_data_url = f"data:image/jpeg;base64,{b64_str}"
                    except Exception as ce:
                        logger.warning(f"Error encoding crop for panel {p_id}: {ce}")

            panel_data = {
                "panel_id": p_id,
                "panel_index": doc.get("panel_index", 0),
                "chapter_id": chap_id_str,
                "chapter_number": doc.get("chapter_number", ""),
                "chapter_title": doc.get("chapter_title", ""),
                "volume": doc.get("volume"),
                "page_number": page_num,
                "page_minio_key": obj_key,
                "coords": coords,
                "width": doc.get("width"),
                "height": doc.get("height"),
                "raw_text": raw_text,
                "cleaned_text": cleaned_text,
                "language": doc.get("language", "en"),
                "scan_mode": doc.get("scan_mode", "panel"),
                "lemmas": doc.get("lemmas", []),
                "vocabulary": vocab_list,
                "narration": doc.get("narration"),
                "created_at": doc.get("created_at", datetime.now(timezone.utc)).isoformat()
                if isinstance(doc.get("created_at"), datetime)
                else str(doc.get("created_at", "")),
                "image_data_url": image_data_url,
            }

            processed_panels.append(panel_data)
            pages_dict[page_id_key]["panels"].append(panel_data)
            pages_dict[page_id_key]["panels_count"] += 1

        # Manga cover base64 / URL
        manga_cover_data = None
        cov_key = manga.get("minio_cover_key")
        if include_images and cov_key:
            cov_bytes = await asyncio.to_thread(_fetch_page_bytes, cov_key)
            if cov_bytes:
                b64_cov = base64.b64encode(cov_bytes).decode("utf-8")
                manga_cover_data = f"data:image/jpeg;base64,{b64_cov}"
        if not manga_cover_data and manga.get("cover_url"):
            manga_cover_data = manga.get("cover_url")

        # Top 30 frequent vocabulary terms
        top_vocab = sorted(
            unique_vocabulary.values(),
            key=lambda x: x["frequency"],
            reverse=True,
        )[:30]

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        report_payload = {
            "report_metadata": {
                "generated_at": now_str,
                "system_engine": "Manga-Reviews-Management Panel Pipeline v2.0",
                "ocr_model": "RapidOCR PP-OCRv4 (ONNX Runtime, DBNet + CRNN)",
                "post_processing_engine": "MangaOCRService (Comic Glyphs, De-hyphenation, wordninja segmentation)",
                "nlp_model": "spaCy en_core_web_sm / Monosyllabic Vietnamese rules",
                "total_pages_in_report": len(pages_dict),
                "total_panels_in_report": len(processed_panels),
                "total_matching_panels_in_db": total_matching_panels,
                "total_word_count": total_word_count,
                "unique_vocabulary_count": len(unique_vocabulary),
                "scan_mode": scan_mode or "all",
                "chapter_scope": f"Ch. {chapter_doc.get('chapter_number')}" if chapter_doc else "All Scanned Chapters",
            },
            "manga": {
                "id": str(manga["_id"]),
                "title": manga.get("title", ""),
                "original_title": manga.get("original_title") or manga.get("title_en", ""),
                "authors": manga.get("authors", []),
                "artists": manga.get("artists", []),
                "genres": manga.get("genres", []),
                "status": manga.get("status", ""),
                "description": manga.get("description", ""),
                "cover_image": manga_cover_data,
            },
            "chapter_context": {
                "id": str(chapter_doc["_id"]) if chapter_doc else None,
                "number": chapter_doc.get("chapter_number") if chapter_doc else None,
                "title": chapter_doc.get("title") if chapter_doc else None,
                "volume": chapter_doc.get("volume") if chapter_doc else None,
            }
            if chapter_doc
            else None,
            "pipeline_technical_specification": {
                "stage_1_page_ingestion": {
                    "description": "Page images retrieved from MinIO S3 bucket, verified and decoded to RGB matrix.",
                    "storage_backend": "MinIO S3",
                    "color_space": "BGR -> Grayscale -> RGB",
                },
                "stage_2_panel_segmentation": {
                    "description": "Morphological boundary extraction for comic layouts.",
                    "algorithm": "Adaptive Gaussian Threshold (blockSize=21, C=5) -> Inversion -> Connected Components / Contour Filtering.",
                    "aspect_ratio_range": "[0.05, 20.0]",
                    "splash_page_cutoff": "> 95% page area ignored",
                    "min_panel_area": "> 1% page area",
                    "overlap_nms_merge_iou": ">= 0.85 smaller box intersection threshold",
                    "reading_order_sort": "Japanese Manga RTL (Banded Horizontal Top-to-Bottom, Right-to-Left) or Western LTR",
                },
                "stage_3_ocr_detection_recognition": {
                    "detection_model": "PP-OCRv4 DBNet (ONNX Runtime, dynamic resolution)",
                    "recognition_model": "PP-OCRv4 CRNN (CTC Loss, character dictionary)",
                    "confidence_threshold": "0.35 minimum confidence filter",
                },
                "stage_4_manga_ocr_post_processing": {
                    "engine": "MangaOCRService",
                    "glyph_correction": "Replaces comic font artefacts: 'cl'->'d', backtick '`'->apostrophe ''', '0'/'O', '1'/'l'",
                    "punctuation_cleaning": "Collapses smart quotes, dashes, ellipses (...), strips control chars",
                    "de_hyphenation": "Rejoins words split by line break hyphens (e.g. 'COUNSEL-\\nOR' -> 'Counselor') via spaCy vocabulary verification",
                    "contraction_splitting": "Separates contractions merged to words (e.g. 'LET\\'SHANGOUTAT' -> 'LET\\'S HANGOUTAT', 'andit\\'s' -> 'and it\\'s')",
                    "stuck_word_segmentation": "Uses wordninja recursive viterbi split with spaCy vocabulary validation (e.g. 'GOTALK' -> 'GO TALK', 'WAITA' -> 'WAIT A')",
                    "case_normalization": "Converts ALL-CAPS comic text to natural sentence case for accurate downstream lemmatization",
                },
                "stage_5_linguistic_feature_extraction": {
                    "nlp_backend": "spaCy (en_core_web_sm)",
                    "features": "Tokenization, Part-of-Speech (POS) tagging, Lemmatization, Stopword deduplication",
                    "vietnamese_mode": "Monosyllabic space rejoining, accent-insensitive search alias indexing",
                },
            },
            "ai_optimization_directive": {
                "role": "Computer Vision & NLP Autonomous Optimization Agent",
                "task_objective": "Evaluate extraction quality across intact original manga page baselines vs panel crops & OCR texts. Identify OCR misreads, segmentation boundary anomalies, and linguistic errors, then formulate a concrete optimization plan.",
                "review_checklist": [
                    "1. Raw Page Baseline vs Segmentation: Compare full intact page against detected panel crops to verify no cut-off panels, missed text in margins, or lost art.",
                    "2. Panel Crop Accuracy: Did the segmentation cut through speech bubbles or characters?",
                    "3. Comic Lettering OCR: Were hand-drawn sound effects (SFX) incorrectly parsed as speech?",
                    "4. De-hyphenation Quality: Were compound hyphenated words ('multi-speed') preserved while broken words ('recom-mend') cleanly rejoined?",
                    "5. Word Segmentation: Did wordninja over-split proper manga character names or foreign terms?",
                    "6. Vocabulary Relevance: Are extracted lemmas appropriate for language learning?",
                ],
                "downstream_action": "Synthesize observed failure modes and propose code changes or threshold recalibrations for vision_service.py and manga_ocr_service.py.",
            },
            "vocabulary_summary": {
                "top_terms": top_vocab,
                "total_unique": len(unique_vocabulary),
            },
            "pages": list(pages_dict.values()),
            "panels": processed_panels,
        }

        return report_payload

    def render_html_report(self, data: Dict[str, Any]) -> str:
        """
        Render a self-contained, publication-grade HTML report with embedded Base64 images,
        print-to-PDF styles, and an embedded JSON-LD script for AI evaluation.
        """
        meta = data.get("report_metadata", {})
        manga = data.get("manga", {})
        pipeline = data.get("pipeline_technical_specification", {})
        ai_dir = data.get("ai_optimization_directive", {})
        panels = data.get("panels", [])
        vocab_summary = data.get("vocabulary_summary", {})

        # Resolve page-level hierarchy: either data["pages"] or dynamically group panels
        pages = data.get("pages")
        if not pages:
            pages_grouped: Dict[str, Dict[str, Any]] = {}
            for p in panels:
                p_key = f"{p.get('chapter_id', '')}_p{p.get('page_number', 1)}"
                if p_key not in pages_grouped:
                    pages_grouped[p_key] = {
                        "page_key": p_key,
                        "chapter_id": p.get("chapter_id", ""),
                        "chapter_number": p.get("chapter_number", ""),
                        "chapter_title": p.get("chapter_title", ""),
                        "volume": p.get("volume"),
                        "page_number": p.get("page_number", 1),
                        "page_minio_key": p.get("page_minio_key"),
                        "original_image_data_url": p.get("original_image_data_url"),
                        "panels_count": 0,
                        "panels": [],
                    }
                pages_grouped[p_key]["panels"].append(p)
                pages_grouped[p_key]["panels_count"] += 1
            pages = list(pages_grouped.values())

        # Serialize full JSON for AI ingestion block
        json_for_ai = json.dumps(data, ensure_ascii=False, indent=2)

        def _render_panel_card(p: Dict[str, Any]) -> str:
            p_img = p.get("image_data_url")
            img_tag = (
                f'<img src="{p_img}" alt="Panel {p.get("panel_index", 0) + 1}" class="panel-img" loading="lazy" />'
                if p_img
                else '<div class="no-img">[No Crop Image Available]</div>'
            )

            raw_text = html.escape(p.get("raw_text", "")).replace("\n", "<br/>")
            cleaned_text = html.escape(p.get("cleaned_text", ""))

            vocab_badges = "".join(
                f'<span class="badge badge-pos" title="Lemma: {html.escape(v.get("lemma", ""))} ({v.get("pos_tag", "")})">'
                f"{html.escape(v.get('term', ''))} <small>{html.escape(v.get('pos_tag', ''))}</small></span>"
                for v in p.get("vocabulary", [])[:12]
            )

            narration_box = ""
            if p.get("narration"):
                narration_box = (
                    f'<div class="narration-box"><strong>AI Narration:</strong> '
                    f"{html.escape(str(p['narration']))}</div>"
                )

            coords_str = ", ".join(f"{c:.3f}" for c in p.get("coords", []))

            return f"""
            <div class="panel-card" id="panel-{p.get("panel_id")}">
              <div class="panel-header">
                <div class="panel-tags">
                  <span class="badge badge-primary">Panel #{p.get("panel_index", 0) + 1}</span>
                  <span class="badge badge-secondary">Trang {p.get("page_number", 1)}</span>
                  <span class="badge badge-chapter">Ch. {html.escape(str(p.get("chapter_number", "")))}</span>
                  {f'<span class="badge badge-vol">Vol. {p.get("volume")}</span>' if p.get("volume") else ""}
                </div>
                <div class="panel-meta-coords font-mono">Coords: [{coords_str}]</div>
              </div>

              <div class="panel-body">
                <div class="panel-visual">
                  {img_tag}
                  <div class="visual-meta">
                    <span>Scan Mode: <code>{html.escape(p.get("scan_mode", "panel"))}</code></span>
                    <span>Lang: <code>{html.escape(p.get("language", "en"))}</code></span>
                  </div>
                </div>

                <div class="panel-content">
                  <div class="content-block">
                    <div class="content-label">Cleaned Dialogue (Post-Processed):</div>
                    <div class="dialogue-box cleaned">{cleaned_text or '<em class="empty">[Không phát hiện lời thoại]</em>'}</div>
                  </div>

                  <div class="content-block">
                    <div class="content-label">Raw OCR Engine Output (PP-OCRv4):</div>
                    <div class="dialogue-box raw">{raw_text or '<em class="empty">[No raw detections]</em>'}</div>
                  </div>

                  {narration_box}

                  <div class="content-block">
                    <div class="content-label">Extracted Vocabulary &amp; Linguistic POS:</div>
                    <div class="vocab-cluster">{vocab_badges or '<em class="empty">Chưa có từ vựng trích xuất</em>'}</div>
                  </div>
                </div>
              </div>
            </div>
            """

        # Build pages HTML sections: Part 1 Raw Page Image -> Part 2 Extracted Panels
        page_sections_html = []
        for pg_idx, pg in enumerate(pages, 1):
            pg_img = pg.get("original_image_data_url")
            if pg_img:
                raw_page_img_tag = f'<img src="{pg_img}" alt="Trang Gốc #{pg.get("page_number", pg_idx)}" class="raw-page-img" loading="lazy" />'
            else:
                raw_page_img_tag = (
                    '<div class="no-img">[Không có ảnh gốc ban đầu hoặc tùy chọn include_images=false]</div>'
                )

            page_panels = pg.get("panels", [])
            rendered_panels_for_page = "\n".join(_render_panel_card(p) for p in page_panels)
            if not rendered_panels_for_page:
                rendered_panels_for_page = (
                    '<div class="empty">Chưa có khung tranh nào được trích xuất trên trang này.</div>'
                )

            vol_badge = f'<span class="badge badge-vol">Vol. {pg.get("volume")}</span>' if pg.get("volume") else ""
            minio_key_display = html.escape(str(pg.get("page_minio_key") or "N/A"))

            page_sections_html.append(f"""
            <article class="page-audit-card" id="page-{pg.get("chapter_id", "chap")}-{pg.get("page_number", pg_idx)}">
              <div class="page-header">
                <div class="page-meta-tags">
                  <span class="badge badge-page-num">Trang Gốc (Original Page) #{pg.get("page_number", pg_idx)}</span>
                  <span class="badge badge-chapter">Ch. {html.escape(str(pg.get("chapter_number", "")))}</span>
                  {vol_badge}
                  <span class="badge badge-secondary">{len(page_panels)} Khung Tranh Đã Trích Xuất</span>
                </div>
                <div class="page-meta-path font-mono" title="MinIO Object Key">Key: {minio_key_display}</div>
              </div>

              <div class="page-body">
                <!-- Part 1: Raw Intact Original Page Image Baseline -->
                <section class="raw-page-block">
                  <div class="raw-page-banner">
                    <div class="raw-page-title">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                      <strong>1. Ảnh Gốc Nguyên Vẹn Ban Đầu (Raw Original Manga Page)</strong>
                    </div>
                    <span class="raw-page-sub">Dữ liệu thô ban đầu đưa vào pipeline &mdash; Cơ sở trực quan đối chiếu kiểm tra bounding box &amp; thoại bị bỏ sót cho AI &amp; Human</span>
                  </div>

                  <div class="raw-page-viewport">
                    {raw_page_img_tag}
                  </div>
                </section>

                <!-- Part 2: Extracted Panels & OCR Transcriptions for this Page -->
                <section class="extracted-panels-block">
                  <div class="extracted-header">
                    <div class="extracted-title">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                      <strong>2. Kết Quả Trích Xuất Khung Tranh Tương Ứng ({len(page_panels)} Panels)</strong>
                    </div>
                    <span class="extracted-sub">Các phân vùng được cắt (crop) và kết quả nhận dạng thoại/từ vựng tương ứng từ trang này</span>
                  </div>

                  <div class="panels-list">
                    {rendered_panels_for_page}
                  </div>
                </section>
              </div>
            </article>
            """)

        pages_rendered = "\n".join(page_sections_html)

        # Top vocabulary list
        top_vocab_html = "".join(
            f'<div class="vocab-item"><span class="term">{html.escape(v["term"])}</span> '
            f'<span class="lemma">({html.escape(v["lemma"])})</span> '
            f'<span class="pos">{html.escape(v["pos_tag"])}</span> '
            f'<span class="freq">x{v["frequency"]}</span></div>'
            for v in vocab_summary.get("top_terms", [])
        )

        # Pipeline stages HTML
        pipeline_stages_html = ""
        for stage_key, stage_val in pipeline.items():
            title = stage_key.replace("_", " ").title()
            details = "".join(
                f"<li><strong>{k.replace('_', ' ').title()}:</strong> {html.escape(str(v))}</li>"
                for k, v in stage_val.items()
            )
            pipeline_stages_html += f"""
            <div class="pipeline-card">
              <h4>{title}</h4>
              <ul>{details}</ul>
            </div>
            """

        # AI checklist HTML
        checklist_html = "".join(f"<li>{html.escape(item)}</li>" for item in ai_dir.get("review_checklist", []))

        html_template = f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Báo Cáo Trích Xuất Panel &amp; Pipeline Audit - {html.escape(manga.get("title", "Manga"))}</title>
  <style>
    :root {{
      --bg-page: #090d16;
      --bg-card: #111726;
      --bg-subtle: #192238;
      --border-color: #24304d;
      --text-main: #e2e8f0;
      --text-muted: #94a3b8;
      --accent: #f59e0b;
      --accent-hover: #d97706;
      --accent-glow: rgba(245, 158, 11, 0.15);
      --success: #10b981;
      --info: #38bdf8;
      --radius: 14px;
    }}

    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg-page);
      color: var(--text-main);
      line-height: 1.6;
      padding: 0;
      margin: 0;
    }}

    /* Header Nav */
    .top-bar {{
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(17, 23, 38, 0.92);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
      padding: 14px 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 14px;
    }}

    .top-title {{
      display: flex;
      align-items: center;
      gap: 12px;
    }}

    .top-title h1 {{
      font-size: 1.15rem;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.02em;
    }}

    .top-actions {{
      display: flex;
      gap: 10px;
    }}

    .btn {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
      border: 1px solid transparent;
    }}

    .btn-primary {{
      background: var(--accent);
      color: #0b0f19;
    }}
    .btn-primary:hover {{ background: var(--accent-hover); }}

    .btn-secondary {{
      background: var(--bg-subtle);
      color: var(--text-main);
      border-color: var(--border-color);
    }}
    .btn-secondary:hover {{ background: #222d4a; }}

    /* Main Container */
    .container {{
      max-width: 1300px;
      margin: 0 auto;
      padding: 28px 20px 80px;
    }}

    /* Hero Manga Profile */
    .manga-hero {{
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 24px;
      display: flex;
      gap: 24px;
      margin-bottom: 28px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }}

    .manga-cover-wrap {{
      width: 140px;
      height: 200px;
      flex-shrink: 0;
      border-radius: 10px;
      overflow: hidden;
      background: #1e293b;
      border: 1px solid var(--border-color);
    }}

    .manga-cover {{
      width: 100%;
      height: 100%;
      object-fit: cover;
    }}

    .manga-info {{
      flex: 1;
      min-width: 0;
    }}

    .manga-title {{
      font-size: 1.6rem;
      font-weight: 800;
      color: #fff;
      margin-bottom: 6px;
    }}

    .manga-meta {{
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }}

    .manga-desc {{
      font-size: 0.88rem;
      color: #cbd5e1;
      line-height: 1.55;
      margin-bottom: 16px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }}

    /* Metrics Bar */
    .metrics-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin-bottom: 28px;
    }}

    .metric-card {{
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 16px 20px;
      text-align: left;
    }}

    .metric-card .val {{
      font-size: 1.6rem;
      font-weight: 900;
      color: var(--accent);
      line-height: 1.1;
      margin-bottom: 4px;
    }}

    .metric-card .lbl {{
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }}

    /* Section Headings */
    .section-title {{
      font-size: 1.25rem;
      font-weight: 800;
      color: #fff;
      margin: 36px 0 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color);
    }}

    /* AI Directive Callout */
    .ai-directive-box {{
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(56, 189, 248, 0.05));
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: var(--radius);
      padding: 22px;
      margin-bottom: 32px;
    }}

    .ai-directive-box h3 {{
      font-size: 1.05rem;
      color: var(--accent);
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    .ai-directive-box p {{
      font-size: 0.9rem;
      color: #e2e8f0;
      margin-bottom: 14px;
    }}

    .ai-directive-box ul {{
      padding-left: 20px;
      margin-bottom: 16px;
      color: #cbd5e1;
      font-size: 0.85rem;
    }}

    .ai-directive-box ul li {{ margin-bottom: 6px; }}

    /* Pipeline Grid */
    .pipeline-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }}

    .pipeline-card {{
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 18px;
    }}

    .pipeline-card h4 {{
      font-size: 0.95rem;
      color: var(--info);
      margin-bottom: 12px;
      font-weight: 700;
    }}

    .pipeline-card ul {{
      list-style: none;
      font-size: 0.8rem;
      color: #cbd5e1;
    }}

    .pipeline-card ul li {{
      margin-bottom: 8px;
      line-height: 1.45;
    }}

    /* Page Audit Card & Raw Page Styles */
    .pages-list {{
      display: flex;
      flex-direction: column;
      gap: 36px;
    }}

    .page-audit-card {{
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }}

    .page-header {{
      background: var(--bg-subtle);
      border-bottom: 1px solid var(--border-color);
      padding: 14px 22px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }}

    .page-meta-tags {{
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }}

    .page-meta-path {{
      font-size: 0.76rem;
      color: var(--text-muted);
    }}

    .badge-page-num {{
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.35);
      font-weight: 800;
      font-size: 0.8rem;
    }}

    .page-body {{
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 32px;
    }}

    .raw-page-block {{
      background: #080c16;
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }}

    .raw-page-banner {{
      display: flex;
      flex-direction: column;
      gap: 4px;
    }}

    .raw-page-title {{
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.95rem;
      color: #38bdf8;
    }}

    .raw-page-sub {{
      font-size: 0.78rem;
      color: var(--text-muted);
    }}

    .raw-page-viewport {{
      display: flex;
      justify-content: center;
      align-items: center;
      background: #03050a;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      padding: 16px;
      min-height: 250px;
    }}

    .raw-page-img {{
      max-width: 100%;
      max-height: 720px;
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      display: block;
    }}

    .extracted-panels-block {{
      display: flex;
      flex-direction: column;
      gap: 16px;
    }}

    .extracted-header {{
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border-color);
    }}

    .extracted-title {{
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.95rem;
      color: var(--accent);
    }}

    .extracted-sub {{
      font-size: 0.78rem;
      color: var(--text-muted);
    }}

    /* Panel Card */
    .panels-list {{
      display: flex;
      flex-direction: column;
      gap: 24px;
    }}

    .panel-card {{
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    }}

    .panel-header {{
      background: var(--bg-subtle);
      border-bottom: 1px solid var(--border-color);
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }}

    .panel-tags {{
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }}

    .panel-meta-coords {{
      font-size: 0.75rem;
      color: var(--text-muted);
    }}

    .panel-body {{
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 20px;
      padding: 20px;
    }}

    @media (max-width: 900px) {{
      .panel-body {{
        grid-template-columns: 1fr;
      }}
    }}

    .panel-visual {{
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #000;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid var(--border-color);
    }}

    .panel-img {{
      width: 100%;
      height: auto;
      max-height: 380px;
      object-fit: contain;
      display: block;
    }}

    .visual-meta {{
      width: 100%;
      background: rgba(17, 23, 38, 0.95);
      border-top: 1px solid var(--border-color);
      padding: 6px 12px;
      display: flex;
      justify-content: space-between;
      font-size: 0.72rem;
      color: var(--text-muted);
    }}

    .panel-content {{
      display: flex;
      flex-direction: column;
      gap: 14px;
    }}

    .content-block {{
      display: flex;
      flex-direction: column;
      gap: 6px;
    }}

    .content-label {{
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }}

    .dialogue-box {{
      padding: 12px 14px;
      border-radius: 8px;
      font-size: 0.9rem;
      line-height: 1.5;
    }}

    .dialogue-box.cleaned {{
      background: rgba(16, 185, 129, 0.07);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: #ecfdf5;
      font-weight: 500;
    }}

    .dialogue-box.raw {{
      background: rgba(56, 189, 248, 0.05);
      border: 1px solid rgba(56, 189, 248, 0.2);
      color: #94a3b8;
      font-family: monospace;
      font-size: 0.82rem;
    }}

    .narration-box {{
      background: rgba(245, 158, 11, 0.07);
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 0.84rem;
      color: #fef3c7;
    }}

    .vocab-cluster {{
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }}

    /* Badges */
    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.72rem;
      font-weight: 700;
    }}

    .badge-primary {{ background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }}
    .badge-secondary {{ background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.25); }}
    .badge-chapter {{ background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }}
    .badge-vol {{ background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }}
    .badge-pos {{
      background: var(--bg-subtle);
      border: 1px solid var(--border-color);
      color: #cbd5e1;
      font-family: monospace;
      font-size: 0.75rem;
    }}
    .badge-pos small {{ opacity: 0.6; font-size: 0.68rem; }}

    .font-mono {{ font-family: monospace; }}
    .empty {{ color: var(--text-muted); font-size: 0.8rem; font-style: italic; }}

    /* Top Vocab List */
    .vocab-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 10px;
      margin-bottom: 32px;
    }}

    .vocab-item {{
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
    }}

    .vocab-item .term {{ font-weight: 700; color: #fff; }}
    .vocab-item .lemma {{ color: var(--text-muted); font-size: 0.72rem; }}
    .vocab-item .pos {{ margin-left: auto; font-size: 0.7rem; font-family: monospace; color: var(--accent); }}
    .vocab-item .freq {{ background: var(--bg-subtle); padding: 1px 5px; border-radius: 4px; font-size: 0.7rem; }}

    /* Print Styles for PDF */
    @media print {{
      body {{ background: #fff !important; color: #000 !important; }}
      .top-bar, .btn {{ display: none !important; }}
      .container {{ max-width: 100% !important; padding: 0 !important; }}
      .manga-hero, .panel-card, .metric-card, .pipeline-card, .page-audit-card {{
        background: #fff !important;
        border: 1px solid #ccc !important;
        color: #000 !important;
        page-break-inside: avoid;
        box-shadow: none !important;
        margin-bottom: 16px !important;
      }}
      .page-audit-card {{
        page-break-before: always;
        break-before: page;
      }}
      .raw-page-block {{
        background: #fff !important;
        border: 1px solid #ddd !important;
      }}
      .raw-page-viewport {{
        background: #fff !important;
        min-height: auto !important;
      }}
      .raw-page-img {{
        max-height: 480px !important;
      }}
      .raw-page-title {{ color: #0369a1 !important; }}
      .extracted-title {{ color: #b45309 !important; }}
      .panel-body {{ grid-template-columns: 240px 1fr !important; }}
      .dialogue-box.cleaned {{ background: #f0fdf4 !important; border-color: #86efac !important; color: #000 !important; }}
      .dialogue-box.raw {{ background: #f8fafc !important; border-color: #cbd5e1 !important; color: #334155 !important; }}
      .badge {{ border: 1px solid #999 !important; color: #000 !important; background: #eee !important; }}
      h1, h2, h3, h4 {{ color: #000 !important; }}
    }}
  </style>
</head>
<body>
  <!-- Top Navigation & Action Bar -->
  <header class="top-bar">
    <div class="top-title">
      <span class="badge badge-primary">Technical Extraction Audit</span>
      <h1>{html.escape(manga.get("title", "Manga"))} &mdash; Pipeline Report</h1>
    </div>

    <div class="top-actions">
      <button onclick="window.print()" class="btn btn-primary" title="In hoặc lưu file PDF">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
        In / Xuất PDF
      </button>

      <button onclick="copyAiPrompt()" class="btn btn-secondary" title="Sao chép Prompt định dạng cho AI Agent">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        Copy Prompt Cho AI
      </button>

      <button onclick="downloadJsonData()" class="btn btn-secondary" title="Tải xuống toàn bộ file dữ liệu JSON cấu trúc">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
        Tải Dữ Liệu JSON
      </button>
    </div>
  </header>

  <main class="container">
    <!-- Manga Profile Header -->
    <section class="manga-hero">
      {f'<div class="manga-cover-wrap"><img src="{manga.get("cover_image")}" alt="{html.escape(manga.get("title", ""))}" class="manga-cover" /></div>' if manga.get("cover_image") else ""}
      <div class="manga-info">
        <h2 class="manga-title">{html.escape(manga.get("title", ""))}</h2>
        <div class="manga-meta">
          <span><strong>Manga ID:</strong> <code>{manga.get("id")}</code></span>
          <span><strong>Phạm vi:</strong> {html.escape(meta.get("chapter_scope", ""))}</span>
          <span><strong>Scan Mode:</strong> <code>{html.escape(meta.get("scan_mode", ""))}</code></span>
          <span><strong>Ngày tạo:</strong> {meta.get("generated_at")}</span>
        </div>
        <div class="manga-desc">{html.escape(manga.get("description") or "Chưa có mô tả manga.")}</div>
      </div>
    </section>

    <!-- Metrics Overview -->
    <section class="metrics-grid">
      <div class="metric-card">
        <div class="val">{meta.get("total_pages_in_report", len(pages))}</div>
        <div class="lbl">Trang Gốc (Original Pages)</div>
      </div>
      <div class="metric-card">
        <div class="val">{meta.get("total_panels_in_report", 0)}</div>
        <div class="lbl">Số Khung Tranh (Panels)</div>
      </div>
      <div class="metric-card">
        <div class="val">{meta.get("total_word_count", 0)}</div>
        <div class="lbl">Tổng Số Từ Thoại</div>
      </div>
      <div class="metric-card">
        <div class="val">{meta.get("unique_vocabulary_count", 0)}</div>
        <div class="lbl">Từ Vựng Độc Nhất (Lemmas)</div>
      </div>
      <div class="metric-card">
        <div class="val">{meta.get("total_matching_panels_in_db", 0)}</div>
        <div class="lbl">Tổng Panels Toàn Bộ Manga</div>
      </div>
    </section>

    <!-- AI Optimization Directive Callout -->
    <section class="ai-directive-box">
      <h3>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
        AI Optimization &amp; Self-Audit Protocol
      </h3>
      <p>
        Báo cáo này được cấu trúc để một mô hình AI đa phương thức (Multimodal LLM) có thể đọc hiểu toàn diện:
        từ từng ảnh khung tranh gốc, đối chiếu trực tiếp với kết quả trích xuất, và đánh giá độ chính xác của toàn bộ quy trình kỹ thuật.
      </p>
      <ul>{checklist_html}</ul>
      <p style="font-size: 0.82rem; color: #94a3b8;">
        <em>Gợi ý: Nhấn nút "Copy Prompt Cho AI" phía trên để nạp toàn bộ chỉ dẫn này kèm dữ liệu cấu trúc vào Claude/GPT/Gemini để AI lập bản kế hoạch tối ưu hóa cho bạn.</em>
      </p>
    </section>

    <!-- Technical Pipeline Blueprint -->
    <h3 class="section-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      Kiến Trúc &amp; Pipeline Kỹ Thuật Áp Dụng
    </h3>
    <section class="pipeline-grid">
      {pipeline_stages_html}
    </section>

    <!-- Vocabulary Summary -->
    <h3 class="section-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>
      Top Từ Vựng Xuất Hiện Nhiều Nhất
    </h3>
    <section class="vocab-grid">
      {top_vocab_html or '<div class="empty">Chưa có dữ liệu từ vựng</div>'}
    </section>

    <!-- Detailed Pages & Panels List -->
    <h3 class="section-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
      Chi Tiết Trang Gốc &amp; Khung Tranh Trích Xuất ({len(pages)} Trang Gốc / {len(panels)} Panels)
    </h3>
    <section class="pages-list">
      {pages_rendered or '<div class="empty">Không tìm thấy dữ liệu trang hoặc khung tranh nào theo tùy chọn lọc đã chọn.</div>'}
    </section>
  </main>

  <!-- Embedded Machine-Readable JSON Block for AI Feed -->
  <script id="ai-structured-data" type="application/json">
{json_for_ai}
  </script>

  <script>
    function copyAiPrompt() {{
      const dataEl = document.getElementById("ai-structured-data");
      const prompt = `BẠN LÀ MỘT CHUYÊN GIA COMPUTER VISION & NLP TRÍCH XUẤT TRUYỆN TRANH.
Hãy phân tích báo cáo kỹ thuật sau đây đối với bộ manga "${manga.get("title", "")}".
Nhiệm vụ của bạn:
1. Đối chiếu ảnh gốc nguyên vẹn ban đầu (Raw Original Page) với từng bounding box và ảnh trích xuất (Panel Crops) tương ứng để phát hiện vùng bị bỏ sót, cắt lẹm thoại hoặc bóng thoại bị chia đôi.
2. Đánh giá chất lượng phân vùng khung tranh (Panel Segmentation) và độ chính xác của OCR (RapidOCR PP-OCRv4 + MangaOCRService).
3. Phát hiện các trường hợp lỗi: Dính chữ, lỗi font chữ truyện tranh, nhận diện sai hiệu ứng âm thanh (SFX) thành thoại, ngắt dòng bị mất từ.
4. Đánh giá chất lượng tách từ vựng & lemmatization.
5. Lập bản kế hoạch hành động cụ thể để cải tiến các tham số và thuật toán hậu xử lý.

DỮ LIỆU CẤU TRÚC CHI TIẾT (JSON):
` + dataEl.textContent;

      navigator.clipboard.writeText(prompt).then(() => {{
        alert("Đã sao chép Prompt & Dữ liệu báo cáo vào bộ nhớ tạm! Bạn có thể dán trực tiếp vào AI để phân tích.");
      }}).catch(err => {{
        console.error("Lỗi sao chép: ", err);
      }});
    }}

    function downloadJsonData() {{
      const dataEl = document.getElementById("ai-structured-data");
      const blob = new Blob([dataEl.textContent], {{ type: "application/json" }});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${manga.get("id", "manga")}-panel-extraction.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }}
  </script>
</body>
</html>
"""
        return html_template


# Module-level singleton
panel_report_service = PanelReportService()
