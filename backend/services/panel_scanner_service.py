import re
import io
import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from bson import ObjectId
import wordninja
import spacy
from PIL import Image

from backend.database.connection import get_db
from backend.services.minio_service import minio_service
from backend.services.vision_service import vision_service

logger = logging.getLogger("panel_scanner_service")

# Hyphenation pattern across comic lines
HYPHEN_REGEX = re.compile(r"(\w+)-\s*\n\s*(\w+)")


def normalize_comic_text(text: str) -> str:
    """
    Clean up comic-specific dialogue formatting:
    1. Rejoin hyphenated words split across lines (e.g. 'incredi- ble' -> 'incredible')
    2. Segment merged words (common in stylized comic OCR, e.g. WENEEDTOBREAKTHEICE)
    3. Normalize ALL-CAPS text to natural sentence case for better NLP lemmatization
    4. Collapse redundant whitespace
    """
    if not text:
        return ""

    # 1. Rejoin hyphenated words
    t = HYPHEN_REGEX.sub(r"\1\2", text)
    t = re.sub(r"-\s+", "", t)
    t = re.sub(r"\s+", " ", t).strip()

    # 2. Segment words if OCR merged long letters without spaces
    words = t.split()
    segmented_words = []
    for w in words:
        alpha_only = re.sub(r"[^a-zA-Z]", "", w)
        if len(alpha_only) >= 9:
            splits = wordninja.split(alpha_only)
            if len(splits) > 1:
                segmented_words.extend(splits)
                continue
        segmented_words.append(w)

    t = " ".join(segmented_words)

    # 3. If entire text is UPPERCASE, convert to title/sentence case
    if t.isupper() and len(t) > 3:
        w_list = t.split()
        normalized_words = []
        for i, w in enumerate(w_list):
            if w == "I" or w.startswith("I'"):
                normalized_words.append(w.capitalize())
            elif i == 0:
                normalized_words.append(w.capitalize())
            else:
                normalized_words.append(w.lower())
        t = " ".join(normalized_words)

    return t


class PanelScannerService:
    def __init__(self):
        self._nlp = None
        self._active_scans: Dict[str, bool] = {}  # manga_id -> is_scanning
        self._scan_stats: Dict[str, Dict[str, Any]] = {}
        self._scan_queues: Dict[str, List[asyncio.Queue]] = {}

    @property
    def nlp(self):
        if self._nlp is None:
            logger.info("Loading spaCy model en_core_web_sm...")
            try:
                self._nlp = spacy.load("en_core_web_sm")
            except Exception as e:
                logger.warning(f"Could not load en_core_web_sm ({e}), fallback to blank en model.")
                self._nlp = spacy.blank("en")
        return self._nlp

    def _get_panels_col(self):
        return get_db().manga_panels

    def _get_chapters_col(self):
        return get_db().chapters

    def _get_mangas_col(self):
        return get_db().mangas

    async def ensure_indexes(self):
        """Create necessary indexes for panel collection."""
        try:
            col = self._get_panels_col()
            await col.create_index([("manga_id", 1), ("chapter_id", 1), ("page_number", 1)])
            await col.create_index([("chapter_id", 1)])
            await col.create_index([("manga_id", 1)])
            await col.create_index([("lemmas", 1)])
            await col.create_index([("raw_text", "text"), ("cleaned_text", "text")])
            logger.info("Manga panels indexes verified/created successfully.")
        except Exception as e:
            logger.warning(f"Error ensuring indexes for manga_panels: {e}")

    def is_scanning(self, manga_id: str) -> bool:
        return self._active_scans.get(manga_id, False)

    def get_scan_status(self, manga_id: str) -> Dict[str, Any]:
        return self._scan_stats.get(
            manga_id,
            {
                "stage": "idle",
                "current": 0,
                "total": 0,
                "percent": 0,
                "message": "Sẵn sàng trích xuất đặc trưng",
                "is_scanning": False,
            },
        )

    def register_queue(self, manga_id: str) -> asyncio.Queue:
        q = asyncio.Queue()
        if manga_id not in self._scan_queues:
            self._scan_queues[manga_id] = []
        self._scan_queues[manga_id].append(q)
        return q

    def unregister_queue(self, manga_id: str, q: asyncio.Queue):
        if manga_id in self._scan_queues:
            if q in self._scan_queues[manga_id]:
                self._scan_queues[manga_id].remove(q)

    async def _emit_progress(
        self, manga_id: str, stage: str, current: int, total: int, message: str
    ):
        percent = int((current / max(1, total)) * 100) if total > 0 else 0
        stat = {
            "stage": stage,
            "current": current,
            "total": total,
            "percent": min(100, percent),
            "message": message,
            "is_scanning": self._active_scans.get(manga_id, False),
        }
        self._scan_stats[manga_id] = stat

        queues = self._scan_queues.get(manga_id, [])
        for q in list(queues):
            try:
                await q.put(stat)
            except Exception:
                pass

    async def trigger_scan(
        self,
        manga_id: str,
        chapter_ids: Optional[List[str]] = None,
        force_rescan: bool = False,
    ) -> Dict[str, Any]:
        """Trigger background scanning and feature extraction for a manga."""
        if self._active_scans.get(manga_id, False):
            return {
                "success": False,
                "message": "Quá trình quét và trích xuất đang diễn ra cho manga này.",
            }

        self._active_scans[manga_id] = True
        asyncio.create_task(self._run_scan_task(manga_id, chapter_ids, force_rescan))
        return {
            "success": True,
            "message": "Đã bắt đầu tác vụ phân tích và trích xuất đặc trưng hình ảnh.",
        }

    async def _run_scan_task(
        self,
        manga_id: str,
        chapter_ids: Optional[List[str]],
        force_rescan: bool,
    ):
        try:
            await self.ensure_indexes()
            await self._emit_progress(
                manga_id, "discovering", 0, 0, "Đang kiểm tra danh sách chapters và trang truyện..."
            )

            # 1. Fetch Manga doc
            m_filter = {"_id": ObjectId(manga_id)} if ObjectId.is_valid(manga_id) else {"_id": manga_id}
            manga = await self._get_mangas_col().find_one(m_filter)
            manga_title = manga.get("title", "Unknown Manga") if manga else "Unknown Manga"

            # 2. Query chapters
            c_filter: Dict[str, Any] = {"manga_id": manga_id}
            if chapter_ids:
                obj_ids = [ObjectId(cid) for cid in chapter_ids if ObjectId.is_valid(cid)]
                str_ids = [cid for cid in chapter_ids if not ObjectId.is_valid(cid)]
                c_filter["$or"] = [{"_id": {"$in": obj_ids}}, {"_id": {"$in": str_ids}}]

            chapters_cursor = self._get_chapters_col().find(c_filter).sort([
                ("chapter_numeric", 1),
                ("chapter_number", 1)
            ])
            chapters = await chapters_cursor.to_list(length=2000)

            total_pages = sum(len(c.get("pages", [])) for c in chapters)
            if total_pages == 0:
                await self._emit_progress(
                    manga_id, "completed", 0, 0, "Chưa có trang truyện nào được lưu trữ để quét."
                )
                return

            await self._emit_progress(
                manga_id,
                "starting",
                0,
                total_pages,
                f"Bắt đầu phân tích {len(chapters)} chapter(s) với tổng cộng {total_pages} trang...",
            )

            processed_pages = 0
            panels_extracted_total = 0

            for chap in chapters:
                c_id_str = str(chap["_id"])
                chap_num = str(chap.get("chapter_number", "1"))
                vol_num = chap.get("volume")
                pages = chap.get("pages", [])

                for page in pages:
                    page_num = page.get("page_number", 1)
                    filename = page.get("filename", f"{page_num}.jpg")
                    obj_key = page.get("object_key") or f"chapters/{manga_id}/{c_id_str}/{filename}"

                    # Check if already indexed
                    if not force_rescan:
                        existing_count = await self._get_panels_col().count_documents({
                            "chapter_id": c_id_str,
                            "page_number": page_num,
                        })
                        if existing_count > 0:
                            processed_pages += 1
                            if processed_pages % 10 == 0 or processed_pages == total_pages:
                                await self._emit_progress(
                                    manga_id,
                                    "indexing",
                                    processed_pages,
                                    total_pages,
                                    f"Bỏ qua trang đã quét: Ch.{chap_num} • Trang {page_num}",
                                )
                            continue

                    # Process new page
                    await self._emit_progress(
                        manga_id,
                        "ocr_processing",
                        processed_pages,
                        total_pages,
                        f"Đang nhận diện panel & text: Ch.{chap_num} • Trang {page_num}/{len(pages)}",
                    )

                    # 1. Fetch image bytes from MinIO or disk
                    image_bytes = await self._fetch_page_bytes(manga_id, c_id_str, filename, obj_key, page)
                    if not image_bytes:
                        processed_pages += 1
                        continue

                    # 2. Run vision pipeline in thread pool to prevent blocking event loop
                    extracted_panels = await asyncio.to_thread(
                        self._analyze_page_image,
                        image_bytes,
                        manga_id,
                        manga_title,
                        c_id_str,
                        chap_num,
                        vol_num,
                        page_num,
                        obj_key,
                    )

                    # 3. Save panels to MongoDB
                    if force_rescan:
                        await self._get_panels_col().delete_many({
                            "chapter_id": c_id_str,
                            "page_number": page_num,
                        })

                    if extracted_panels:
                        await self._get_panels_col().insert_many(extracted_panels)
                        panels_extracted_total += len(extracted_panels)

                    processed_pages += 1
                    await self._emit_progress(
                        manga_id,
                        "indexing",
                        processed_pages,
                        total_pages,
                        f"Đã trích xuất {len(extracted_panels)} panels từ Ch.{chap_num} • Trang {page_num}",
                    )

                    # Cooperative sleep
                    await asyncio.sleep(0.01)

            await self._emit_progress(
                manga_id,
                "completed",
                processed_pages,
                total_pages,
                f"Hoàn thành! Đã quét {processed_pages} trang và trích xuất thành công {panels_extracted_total} panels.",
            )

        except Exception as e:
            logger.error(f"Error during manga panels scan for {manga_id}: {e}", exc_info=True)
            await self._emit_progress(
                manga_id, "error", 0, 0, f"Đã xảy ra lỗi khi quét: {str(e)}"
            )
        finally:
            self._active_scans[manga_id] = False

    async def _fetch_page_bytes(
        self,
        manga_id: str,
        chapter_id: str,
        filename: str,
        obj_key: str,
        page_doc: Dict[str, Any],
    ) -> Optional[bytes]:
        """Fetch image bytes from MinIO (or fallback to local disk)."""
        # Try MinIO first
        try:
            def _get_minio():
                resp = minio_service.client.get_object(minio_service.bucket, obj_key)
                data = resp.read()
                resp.close()
                resp.release_conn()
                return data

            return await asyncio.to_thread(_get_minio)
        except Exception as e:
            logger.debug(f"Could not fetch {obj_key} from MinIO ({e}), trying fallback key...")

        # Fallback MinIO key: chapters/{manga_id}/{chapter_id}/{filename}
        try:
            alt_key = f"chapters/{manga_id}/{chapter_id}/{filename}"
            def _get_alt_minio():
                resp = minio_service.client.get_object(minio_service.bucket, alt_key)
                data = resp.read()
                resp.close()
                resp.release_conn()
                return data

            return await asyncio.to_thread(_get_alt_minio)
        except Exception:
            pass

        # Try disk file if specified
        file_path = page_doc.get("file_path")
        if file_path:
            import os
            if os.path.exists(file_path):
                try:
                    with open(file_path, "rb") as f:
                        return f.read()
                except Exception as fe:
                    logger.warning(f"Error reading local file {file_path}: {fe}")

        logger.warning(f"Failed to fetch image bytes for page {filename} in chapter {chapter_id}")
        return None

    def _analyze_page_image(
        self,
        image_bytes: bytes,
        manga_id: str,
        manga_title: str,
        chapter_id: str,
        chapter_num: str,
        vol_num: Optional[str],
        page_num: int,
        obj_key: str,
    ) -> List[Dict[str, Any]]:
        """Decode image, segment panels, run OCR, NLP tokenize, lemmatize."""
        img = vision_service.decode_image_bytes(image_bytes)
        if img is None:
            return []

        height, width = img.shape[:2]

        # 1. Segment panels
        panels = vision_service.segment_panels(img)

        # 2. Run OCR
        detections = vision_service.detect_text(img)

        # 3. Associate text with panels
        panel_texts_list = vision_service.associate_text_with_panels(panels, detections)

        result_docs = []
        now = datetime.utcnow()

        for p_idx, (nx1, ny1, nx2, ny2) in enumerate(panels):
            assigned_texts = panel_texts_list[p_idx]
            raw_text = " ".join(d["text"] for d in assigned_texts).strip()
            cleaned_text = normalize_comic_text(raw_text)

            lemmas = []
            vocab_list = []

            if cleaned_text:
                doc = self.nlp(cleaned_text)
                lemmas = [
                    token.lemma_.lower()
                    for token in doc
                    if not token.is_punct and not token.is_space
                ]

                # Extract vocabulary terms
                vocab_counts: Dict[str, Dict[str, Any]] = {}
                for token in doc:
                    if token.is_punct or token.is_space or len(token.text) <= 1:
                        continue
                    lemma = token.lemma_.lower()
                    if lemma not in vocab_counts:
                        vocab_counts[lemma] = {
                            "term": token.text,
                            "pos_tag": token.pos_,
                            "count": 1,
                        }
                    else:
                        vocab_counts[lemma]["count"] += 1

                for lemma, info in vocab_counts.items():
                    vocab_list.append(
                        {
                            "term": info["term"],
                            "lemma": lemma,
                            "pos_tag": info["pos_tag"],
                            "frequency": info["count"],
                        }
                    )

            panel_doc = {
                "manga_id": manga_id,
                "manga_title": manga_title,
                "chapter_id": chapter_id,
                "chapter_number": chapter_num,
                "volume": vol_num,
                "page_number": page_num,
                "page_minio_key": obj_key,
                "panel_index": p_idx,
                "coords": [nx1, ny1, nx2, ny2],
                "width": width,
                "height": height,
                "raw_text": raw_text,
                "cleaned_text": cleaned_text,
                "lemmas": lemmas,
                "vocabulary": vocab_list,
                "created_at": now,
            }
            result_docs.append(panel_doc)

        return result_docs

    async def search_panels(
        self,
        manga_id: str,
        query: str,
        chapter_id: Optional[str] = None,
        limit: int = 24,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        Search panels by dialogue, keyword, or lemma across stored chapters.
        Returns ranked panels with highlighted snippets and metadata.
        """
        clean_q = query.strip()
        if not clean_q:
            return {"total": 0, "limit": limit, "offset": offset, "results": [], "query": ""}

        # Base filter
        base_filter: Dict[str, Any] = {"manga_id": manga_id}
        if chapter_id and chapter_id != "all":
            base_filter["chapter_id"] = chapter_id

        # Analyze query lemmas with spaCy
        q_doc = self.nlp(clean_q)
        query_lemmas = [
            token.lemma_.lower()
            for token in q_doc
            if not token.is_punct and not token.is_space
        ]

        tokens = [t for t in clean_q.split() if t]
        escaped_q = re.escape(clean_q)

        # Multi-stage matching: phrase match OR all tokens match OR lemma match
        search_or = [
            {"cleaned_text": {"$regex": escaped_q, "$options": "i"}},
            {"raw_text": {"$regex": escaped_q, "$options": "i"}},
        ]

        if query_lemmas:
            search_or.append({"lemmas": {"$in": query_lemmas}})

        if len(tokens) > 1:
            token_ands = [{"cleaned_text": {"$regex": re.escape(t), "$options": "i"}} for t in tokens]
            search_or.append({"$and": token_ands})

        base_filter["$or"] = search_or

        col = self._get_panels_col()
        total = await col.count_documents(base_filter)

        cursor = col.find(base_filter).sort([
            ("created_at", -1),
            ("chapter_number", 1),
            ("page_number", 1),
            ("panel_index", 1),
        ]).skip(offset).limit(limit)

        results = []
        async for doc in cursor:
            raw_text = doc.get("raw_text", "")
            cleaned = doc.get("cleaned_text", "")

            # Generate highlighted text snippet
            highlighted = self._highlight_text(raw_text or cleaned, tokens)

            results.append(
                {
                    "panel_id": str(doc["_id"]),
                    "manga_id": doc.get("manga_id"),
                    "manga_title": doc.get("manga_title", ""),
                    "chapter_id": doc.get("chapter_id"),
                    "chapter_number": doc.get("chapter_number", ""),
                    "volume": doc.get("volume"),
                    "page_number": doc.get("page_number", 1),
                    "panel_index": doc.get("panel_index", 0),
                    "coords": doc.get("coords", [0.0, 0.0, 1.0, 1.0]),
                    "raw_text": raw_text,
                    "cleaned_text": cleaned,
                    "highlighted_text": highlighted,
                    "vocabulary": doc.get("vocabulary", []),
                }
            )

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "query": query,
            "results": results,
        }

    def _highlight_text(self, text: str, tokens: List[str]) -> str:
        """Surround matching terms with <mark> tag for rich display."""
        if not text or not tokens:
            return text

        pattern = "|".join(re.escape(t) for t in tokens if t)
        if not pattern:
            return text

        def _repl(m):
            return f'<mark class="bg-amber-400/30 text-amber-300 font-bold px-1 rounded border-b border-amber-400">{m.group(0)}</mark>'

        try:
            return re.sub(pattern, _repl, text, flags=re.IGNORECASE)
        except Exception:
            return text

    async def get_manga_stats(self, manga_id: str) -> Dict[str, Any]:
        """Return total panels, indexed pages, distinct vocabulary for manga."""
        col = self._get_panels_col()
        total_panels = await col.count_documents({"manga_id": manga_id})

        # Distinct chapters scanned
        scanned_chap_ids = await col.distinct("chapter_id", {"manga_id": manga_id})

        # Aggregation for vocabulary count
        pipeline = [
            {"$match": {"manga_id": manga_id}},
            {"$unwind": "$lemmas"},
            {"$group": {"_id": "$lemmas"}},
            {"$count": "total_words"}
        ]
        agg_res = await col.aggregate(pipeline).to_list(1)
        total_words = agg_res[0]["total_words"] if agg_res else 0

        # Total pages scanned
        page_pipeline = [
            {"$match": {"manga_id": manga_id}},
            {"$group": {"_id": {"chap": "$chapter_id", "pg": "$page_number"}}},
            {"$count": "total_pages"}
        ]
        page_res = await col.aggregate(page_pipeline).to_list(1)
        total_pages = page_res[0]["total_pages"] if page_res else 0

        return {
            "manga_id": manga_id,
            "total_panels": total_panels,
            "total_pages_scanned": total_pages,
            "total_chapters_scanned": len(scanned_chap_ids),
            "total_unique_words": total_words,
            "is_scanning": self._active_scans.get(manga_id, False),
        }

    async def delete_panels_for_chapter(self, chapter_id: str):
        """Cascading delete constraint: called when chapter is deleted."""
        try:
            res = await self._get_panels_col().delete_many({"chapter_id": chapter_id})
            logger.info(f"Cascading deletion: deleted {res.deleted_count} panels for chapter {chapter_id}")
        except Exception as e:
            logger.error(f"Error deleting panels for chapter {chapter_id}: {e}")

    async def delete_panels_for_pages(self, chapter_id: str, page_numbers: List[int]):
        """Cascading delete constraint: called when specific pages are deleted."""
        try:
            res = await self._get_panels_col().delete_many({
                "chapter_id": chapter_id,
                "page_number": {"$in": page_numbers}
            })
            logger.info(f"Cascading deletion: deleted {res.deleted_count} panels for deleted pages in chapter {chapter_id}")
        except Exception as e:
            logger.error(f"Error deleting panels for pages in chapter {chapter_id}: {e}")

    async def renumber_panels_for_chapter(self, chapter_id: str, old_to_new_pages: Dict[int, int]):
        """Cascading update constraint: update page numbers after pages were renumbered."""
        try:
            for old_p, new_p in old_to_new_pages.items():
                if old_p != new_p:
                    await self._get_panels_col().update_many(
                        {"chapter_id": chapter_id, "page_number": old_p},
                        {"$set": {"page_number": new_p}}
                    )
        except Exception as e:
            logger.error(f"Error renumbering panels for chapter {chapter_id}: {e}")


panel_scanner_service = PanelScannerService()
