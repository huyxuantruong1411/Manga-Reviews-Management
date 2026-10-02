import asyncio
import html
import logging
import re
import unicodedata
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from bson import ObjectId

from backend.database.connection import get_db
from backend.services.manga_ocr_service import manga_ocr_service
from backend.services.minio_service import minio_service
from backend.services.vision_service import vision_service

logger = logging.getLogger("panel_scanner_service")

# Hyphenation pattern across comic lines
HYPHEN_REGEX = re.compile(r"(\w+)-\s*\n\s*(\w+)")

# Vietnamese stopwords for dialogue NLP feature extraction
VIETNAMESE_STOPWORDS = {
    "và",
    "là",
    "của",
    "các",
    "những",
    "có",
    "thì",
    "mà",
    "ở",
    "được",
    "với",
    "trong",
    "cho",
    "về",
    "khi",
    "này",
    "đó",
    "như",
    "đã",
    "sẽ",
    "đang",
    "tôi",
    "anh",
    "cô",
    "chú",
    "bác",
    "em",
    "nó",
    "họ",
    "mình",
    "cậu",
    "tớ",
    "ạ",
    "nhé",
    "nha",
    "hả",
    "sao",
    "gì",
    "ai",
    "đâu",
    "nào",
    "một",
    "rất",
    "quá",
    "lắm",
    "nhiều",
    "ít",
    "đến",
    "từ",
    "ra",
    "vào",
    "lại",
    "qua",
    "lên",
    "xuống",
    "hay",
    "hoặc",
    "nhưng",
    "bởi",
    "vì",
}


_EN_VOCAB_STRINGS = None


def get_english_vocab():
    global _EN_VOCAB_STRINGS
    if _EN_VOCAB_STRINGS is None:
        try:
            import spacy

            nlp = spacy.load("en_core_web_sm")
            _EN_VOCAB_STRINGS = nlp.vocab.strings
        except Exception:
            _EN_VOCAB_STRINGS = set()
    return _EN_VOCAB_STRINGS


def strip_vietnamese_accents(text: str) -> str:
    """Strip diacritics/accents from Vietnamese text for robust search fallback."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in nfkd if not unicodedata.combining(c))
    return stripped.replace("đ", "d").replace("Đ", "D")


def normalize_comic_text(text: str, language: str = "en") -> str:
    """
    Clean up comic-specific dialogue formatting:
    1. Rejoin hyphenated words split across lines:
       - English: 'recom-\\nmend' -> 'recommend', while preserving 'multi-speed'
       - Vietnamese: 'cố-\\nlên' -> 'cố lên' (Vietnamese monosyllabic words)
    2. Split contractions stuck to words: 'andit's' -> 'and it's', 'I'drecom-' -> 'I'd recom-'
    3. Segment squished English words caused by narrow comic fonts ('Iwas' -> 'I was', 'onemore' -> 'one more')
    4. Normalize ALL-CAPS text to natural sentence case for better NLP lemmatization
    5. Collapse redundant whitespace
    """
    if not text:
        return ""

    is_vi = (language or "en").lower() == "vi"

    # Normalize Unicode to canonical decomposition / composition (NFC)
    text = unicodedata.normalize("NFC", text)

    # 1. Rejoin hyphenated words
    if is_vi:
        t = re.sub(r"(\w+)-\s*\n\s*(\w+)", r"\1 \2", text)
        t = re.sub(r"-\s+", " ", t)
        t = re.sub(r"\s+", " ", t).strip()
    else:
        vocab = get_english_vocab()

        def _resolve_hyphen(m):
            w1 = m.group(1)
            w2 = m.group(2)
            joined = (w1 + w2).lower()
            if joined in vocab:
                return w1 + w2
            return f"{w1}-{w2}"

        t = HYPHEN_REGEX.sub(_resolve_hyphen, text)
        t = re.sub(r"-\s*\n\s*", "-", t)
        t = re.sub(r"\s+", " ", t).strip()

    # 2. English contractions and word segmentation
    if not is_vi:
        import wordninja

        # Separate contractions glued to adjacent words:
        # e.g., andit's -> and it's, butit's -> but it's
        t = re.sub(
            r"\b(and|but|or|if|so|that|for|with)(it's|i'm|i'd|i'll|you're|we're|they're)\b",
            r"\1 \2",
            t,
            flags=re.IGNORECASE,
        )
        # e.g., I'drecommend -> I'd recommend
        t = re.sub(r"\b([A-Za-z]+'(?:d|m|ll|re|ve|s|t))([A-Za-z]{2,})\b", r"\1 \2", t)

        vocab = get_english_vocab()
        tokens = t.split()
        repaired_tokens = []

        for token in tokens:
            # Strip leading/trailing punctuation for analysis
            match = re.match(r"^([^A-Za-z]*)([A-Za-z'-]+)([^A-Za-z]*)$", token)
            if not match:
                repaired_tokens.append(token)
                continue

            lead_punct, core_word, trail_punct = match.groups()

            # Skip if contains hyphens (like multi-speed) or apostrophes (like I'd, it's)
            if "-" in core_word or "'" in core_word:
                repaired_tokens.append(token)
                continue

            # Don't split short tokens or tokens that are already valid English words
            if len(core_word) < 4:
                # Special check for 'Iwas' -> length 4, but let's check core_word.lower()
                pass

            core_lower = core_word.lower()
            # If word is already in vocabulary, keep it untouched (e.g. school, starts, person)
            # EXCEPT if it starts with 'I' followed by a lowercase verb (e.g. Iwas, Iwent, Ican)
            is_i_contraction = core_word.startswith("I") and len(core_word) >= 3 and core_word[1].islower()
            if core_lower in vocab and not is_i_contraction:
                repaired_tokens.append(token)
                continue

            # Skip proper names (TitleCase, e.g. Kinomiya, Naruto) unless it's an 'I'-run
            if core_word.istitle() and not is_i_contraction:
                repaired_tokens.append(token)
                continue

            # Attempt word segmentation
            parts = wordninja.split(core_word)
            if len(parts) > 1 and all(len(p) > 1 or p.lower() in {"a", "i"} for p in parts):
                # Ensure all segments are valid English vocabulary words
                if all(p.lower() in vocab for p in parts):
                    if core_word[0].isupper() and parts[0].islower():
                        parts[0] = parts[0].capitalize()
                    segmented = " ".join(parts)
                    repaired_tokens.append(f"{lead_punct}{segmented}{trail_punct}")
                    continue

            repaired_tokens.append(token)

        t = " ".join(repaired_tokens)

        # Split long all-caps runs
        def split_allcaps_run(match):
            parts = wordninja.split(match.group())
            if len(parts) > 1 and all(len(p) > 1 or p.lower() in {"a", "i"} for p in parts):
                return " ".join(parts).upper()
            return match.group()

        t = re.sub(r"\b[A-Z]{9,}\b", split_allcaps_run, t)

    # 3. If entire text is UPPERCASE, convert to title/sentence case
    if t.isupper() and len(t) > 3:
        if is_vi:
            t = t[0].upper() + t[1:].lower()
        else:
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
        self._cancel_scan: Dict[str, bool] = {}  # manga_id -> cancel requested
        self._scan_stats: Dict[str, Dict[str, Any]] = {}
        self._scan_queues: Dict[str, List[asyncio.Queue]] = {}

        # Global system-wide scan states
        self._global_scan_active: bool = False
        self._cancel_global_scan: bool = False
        self._global_scan_status: Dict[str, Any] = {
            "stage": "idle",
            "current_manga_id": None,
            "current_manga_title": "",
            "mangas_scanned": 0,
            "total_mangas": 0,
            "current_page": 0,
            "total_pages": 0,
            "panels_extracted": 0,
            "percent": 0,
            "message": "Hệ thống sẵn sàng trích xuất đặc trưng toàn thư viện.",
            "is_scanning": False,
        }
        self._global_scan_queues: List[asyncio.Queue] = []

    @property
    def nlp(self):
        if self._nlp is None:
            import spacy

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

    def extract_language_features(self, text: str, language: str = "en") -> Tuple[List[str], List[Dict[str, Any]]]:
        """
        Extract search lemmas and vocabulary items based on language:
        - English (en): spaCy lemmatization + POS tagging
        - Vietnamese (vi): Word extraction + unaccented search aliases + stopword filtering
        """
        if not text:
            return [], []

        is_vi = (language or "en").lower() == "vi"

        if is_vi:
            # Extract Vietnamese words (tokens with letters, digits, and diacritics)
            tokens = re.findall(r"\b[A-Za-zÀ-ỹĐđ0-9]+\b", text)
            lemmas_set = set()
            vocab_counts: Dict[str, Dict[str, Any]] = {}

            for token in tokens:
                t_lower = token.lower()
                if len(t_lower) <= 1 or t_lower in VIETNAMESE_STOPWORDS:
                    continue

                lemmas_set.add(t_lower)
                unaccent = strip_vietnamese_accents(t_lower)
                if unaccent and unaccent != t_lower:
                    lemmas_set.add(unaccent)

                if t_lower not in vocab_counts:
                    vocab_counts[t_lower] = {
                        "term": token,
                        "pos_tag": "NOUN",
                        "count": 1,
                    }
                else:
                    vocab_counts[t_lower]["count"] += 1

            vocab_list = [
                {
                    "term": info["term"],
                    "lemma": lemma,
                    "pos_tag": info["pos_tag"],
                    "frequency": info["count"],
                }
                for lemma, info in vocab_counts.items()
            ]
            return list(lemmas_set), vocab_list

        else:
            # English: spaCy
            doc = self.nlp(text)
            lemmas = [
                (token.lemma_ or token.text).lower() for token in doc if not token.is_punct and not token.is_space
            ]

            vocab_counts = {}
            for token in doc:
                if token.is_punct or token.is_space or len(token.text) <= 1:
                    continue
                lemma = (token.lemma_ or token.text).lower()
                if lemma not in vocab_counts:
                    vocab_counts[lemma] = {
                        "term": token.text,
                        "pos_tag": token.pos_,
                        "count": 1,
                    }
                else:
                    vocab_counts[lemma]["count"] += 1

            vocab_list = [
                {
                    "term": info["term"],
                    "lemma": lemma,
                    "pos_tag": info["pos_tag"],
                    "frequency": info["count"],
                }
                for lemma, info in vocab_counts.items()
            ]
            return lemmas, vocab_list

    async def ensure_indexes(self):
        """Create necessary indexes for panel collection."""
        try:
            col = self._get_panels_col()
            await col.create_index([("manga_id", 1), ("chapter_id", 1), ("page_number", 1)])
            await col.create_index([("chapter_id", 1)])
            await col.create_index([("manga_id", 1)])
            await col.create_index([("language", 1)])
            await col.create_index([("scan_mode", 1)])
            await col.create_index([("lemmas", 1)])
            await col.create_index([("raw_text", "text"), ("cleaned_text", "text")])
            await get_db().panel_scan_pages.create_index([("chapter_id", 1), ("page_number", 1)], unique=True)
            logger.info("Manga panels indexes verified/created successfully.")
        except Exception as e:
            logger.warning(f"Error ensuring indexes for manga_panels: {e}")

    def is_scanning(self, manga_id: str) -> bool:
        return self._active_scans.get(manga_id, False) or self._global_scan_active

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
        q = asyncio.Queue(maxsize=1)
        if manga_id not in self._scan_queues:
            self._scan_queues[manga_id] = []
        self._scan_queues[manga_id].append(q)
        return q

    def unregister_queue(self, manga_id: str, q: asyncio.Queue):
        if manga_id in self._scan_queues:
            if q in self._scan_queues[manga_id]:
                self._scan_queues[manga_id].remove(q)

    async def _emit_progress(self, manga_id: str, stage: str, current: int, total: int, message: str):
        if stage in {"completed", "error", "cancelled"}:
            self._active_scans[manga_id] = False
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
                if q.full():
                    q.get_nowait()
                q.put_nowait(stat)
            except Exception:
                pass

    # --- Global System-wide Scan Support ---
    def get_global_scan_status(self) -> Dict[str, Any]:
        return dict(self._global_scan_status)

    def register_global_queue(self) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=1)
        self._global_scan_queues.append(q)
        return q

    def unregister_global_queue(self, q: asyncio.Queue):
        if q in self._global_scan_queues:
            self._global_scan_queues.remove(q)

    async def _emit_global_progress(
        self,
        stage: str,
        current_manga_id: Optional[str],
        current_manga_title: str,
        mangas_scanned: int,
        total_mangas: int,
        current_page: int,
        total_pages: int,
        panels_extracted: int,
        message: str,
    ):
        if stage in {"completed", "error", "cancelled"}:
            self._global_scan_active = False
        percent = int((current_page / max(1, total_pages)) * 100) if total_pages > 0 else 0
        stat = {
            "stage": stage,
            "current_manga_id": current_manga_id,
            "current_manga_title": current_manga_title,
            "mangas_scanned": mangas_scanned,
            "total_mangas": total_mangas,
            "current_page": current_page,
            "total_pages": total_pages,
            "panels_extracted": panels_extracted,
            "percent": min(100, percent),
            "message": message,
            "is_scanning": self._global_scan_active,
        }
        self._global_scan_status = stat

        for q in list(self._global_scan_queues):
            try:
                if q.full():
                    q.get_nowait()
                q.put_nowait(stat)
            except Exception:
                pass

    async def trigger_global_scan(
        self,
        manga_ids: Optional[List[str]] = None,
        force_rescan: bool = False,
        language: Optional[str] = None,
        chapter_language: Optional[str] = None,
        scan_mode: str = "panel",
        reading_direction: str = "rtl",
        skip_blank_pages: bool = True,
        skip_duplicate_credits: bool = True,
    ) -> Dict[str, Any]:
        """Trigger background scanning across the entire manga library or selected manga."""
        if self._global_scan_active or any(self._active_scans.values()):
            return {
                "success": False,
                "message": "Quá trình quét toàn bộ thư viện đang diễn ra.",
            }

        self._global_scan_active = True
        self._cancel_global_scan = False
        await self._emit_global_progress("starting", None, "", 0, 0, 0, 0, 0, "Đang khởi động quét...")
        asyncio.create_task(
            self._run_global_scan_task(
                manga_ids,
                force_rescan,
                language=language,
                chapter_language=chapter_language,
                scan_mode=scan_mode,
                reading_direction=reading_direction,
                skip_blank_pages=skip_blank_pages,
                skip_duplicate_credits=skip_duplicate_credits,
            )
        )
        return {
            "success": True,
            "message": "Đã kích hoạt quét trích xuất đặc trưng hình ảnh cho toàn hệ thống.",
        }

    def cancel_global_scan(self) -> Dict[str, Any]:
        """Cancel ongoing global library scan."""
        if not self._global_scan_active:
            return {"success": False, "message": "Không có tác vụ quét nào đang chạy."}
        self._cancel_global_scan = True
        return {"success": True, "message": "Đã gửi yêu cầu dừng quét hệ thống."}

    def cancel_scan(self, manga_id: str) -> Dict[str, Any]:
        """Cancel ongoing scan for a specific manga."""
        if not self._active_scans.get(manga_id):
            return {"success": False, "message": "Không có tác vụ quét nào đang chạy cho manga này."}
        self._cancel_scan[manga_id] = True
        return {"success": True, "message": "Đã gửi yêu cầu dừng quét manga."}

    async def trigger_scan(
        self,
        manga_id: str,
        chapter_ids: Optional[List[str]] = None,
        force_rescan: bool = False,
        language: Optional[str] = None,
        chapter_language: Optional[str] = None,
        scan_mode: str = "panel",
        reading_direction: str = "rtl",
        skip_blank_pages: bool = True,
        skip_duplicate_credits: bool = True,
    ) -> Dict[str, Any]:
        """Trigger background scanning and feature extraction for a single manga."""
        if any(self._active_scans.values()) or self._global_scan_active:
            return {
                "success": False,
                "message": "Quá trình quét và trích xuất đang diễn ra.",
            }

        self._active_scans[manga_id] = True
        self._cancel_scan[manga_id] = False
        await self._emit_progress(manga_id, "starting", 0, 0, "Đang khởi động quét...")
        asyncio.create_task(
            self._run_scan_task(
                manga_id,
                chapter_ids,
                force_rescan,
                language=language,
                chapter_language=chapter_language,
                scan_mode=scan_mode,
                reading_direction=reading_direction,
                skip_blank_pages=skip_blank_pages,
                skip_duplicate_credits=skip_duplicate_credits,
            )
        )
        return {
            "success": True,
            "message": "Đã bắt đầu tác vụ phân tích và trích xuất đặc trưng hình ảnh.",
        }

    async def _run_scan_task(
        self,
        manga_id: str,
        chapter_ids: Optional[List[str]],
        force_rescan: bool,
        language: Optional[str] = None,
        chapter_language: Optional[str] = None,
        scan_mode: str = "panel",
        reading_direction: str = "rtl",
        skip_blank_pages: bool = True,
        skip_duplicate_credits: bool = True,
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
            if chapter_language and chapter_language != "all":
                c_filter["language"] = chapter_language
            if chapter_ids:
                obj_ids = [ObjectId(cid) for cid in chapter_ids if ObjectId.is_valid(cid)]
                str_ids = [cid for cid in chapter_ids if not ObjectId.is_valid(cid)]
                c_filter["$or"] = [{"_id": {"$in": obj_ids}}, {"_id": {"$in": str_ids}}]

            chapters_cursor = (
                self._get_chapters_col().find(c_filter).sort([("chapter_numeric", 1), ("chapter_number", 1)])
            )
            chapters = await chapters_cursor.to_list(length=None)

            total_pages = sum(len(c.get("pages", [])) for c in chapters)
            if total_pages == 0:
                await self._emit_progress(manga_id, "completed", 0, 0, "Chưa có trang truyện nào được lưu trữ để quét.")
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
            seen_credit_hashes: Dict[str, int] = {}

            for chap in chapters:
                if self._cancel_scan.get(manga_id):
                    break
                c_id_str = str(chap["_id"])
                chap_num = str(chap.get("chapter_number", "1"))
                chap_title = chap.get("title", "")
                vol_num = chap.get("volume")
                pages = chap.get("pages", [])

                for page in pages:
                    if self._cancel_scan.get(manga_id):
                        break
                    page_num = page.get("page_number", 1)
                    filename = page.get("filename", f"{page_num}.jpg")
                    obj_key = page.get("object_key") or f"chapters/{manga_id}/{c_id_str}/{filename}"

                    # Check if already indexed
                    if not force_rescan:
                        existing_count = await get_db().panel_scan_pages.find_one(
                            {
                                "chapter_id": c_id_str,
                                "page_number": page_num,
                                "object_key": obj_key,
                                "page_hash": page.get("md5_hash"),
                                "pipeline_version": 2,
                            }
                        )
                        if existing_count:
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
                        raise RuntimeError(f"Không đọc được Ch.{chap_num}, trang {page_num}; dữ liệu cũ được giữ lại.")

                    img = vision_service.decode_image_bytes(image_bytes)
                    if img is None:
                        processed_pages += 1
                        continue

                    # Pre-processing filter 1: Skip blank or uniform black/white pages
                    if skip_blank_pages and vision_service.is_blank_or_uniform_page(img):
                        processed_pages += 1
                        await self._emit_progress(
                            manga_id,
                            "indexing",
                            processed_pages,
                            total_pages,
                            f"Bỏ qua trang trắng/đen không có chi tiết: Ch.{chap_num} • Trang {page_num}",
                        )
                        continue

                    # Pre-processing filter 2: Skip duplicate credits
                    if skip_duplicate_credits:
                        ph = vision_service.compute_image_phash(img)
                        if ph:
                            seen_credit_hashes[ph] = seen_credit_hashes.get(ph, 0) + 1
                            if seen_credit_hashes[ph] >= 2 and (page_num <= 2 or page_num >= len(pages) - 1):
                                processed_pages += 1
                                await self._emit_progress(
                                    manga_id,
                                    "indexing",
                                    processed_pages,
                                    total_pages,
                                    f"Bỏ qua trang credit trùng lặp: Ch.{chap_num} • Trang {page_num}",
                                )
                                continue

                    # 2. Run vision pipeline in thread pool to prevent blocking event loop
                    eff_lang = language or chap.get("language") or "en"
                    extracted_panels = await asyncio.to_thread(
                        self._analyze_page_image,
                        img,
                        manga_id,
                        manga_title,
                        c_id_str,
                        chap_num,
                        vol_num,
                        page_num,
                        obj_key,
                        chap_title,
                        eff_lang,
                        scan_mode,
                        reading_direction,
                    )

                    if self._cancel_scan.get(manga_id):
                        break

                    await self._save_page_panels(
                        manga_id, c_id_str, page_num, obj_key, extracted_panels, page.get("md5_hash")
                    )
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

            if self._cancel_scan.get(manga_id):
                await self._emit_progress(
                    manga_id,
                    "cancelled",
                    processed_pages,
                    total_pages,
                    f"Đã dừng tác vụ quét theo yêu cầu. Đã quét {processed_pages}/{total_pages} trang và trích xuất {panels_extracted_total} panels.",
                )
            else:
                await self._emit_progress(
                    manga_id,
                    "completed",
                    processed_pages,
                    total_pages,
                    f"Hoàn thành! Đã quét {processed_pages} trang và trích xuất thành công {panels_extracted_total} panels.",
                )

        except Exception as e:
            logger.error(f"Error during manga panels scan for {manga_id}: {e}", exc_info=True)
            await self._emit_progress(manga_id, "error", 0, 0, f"Đã xảy ra lỗi khi quét: {str(e)}")
        finally:
            self._active_scans[manga_id] = False
            self._cancel_scan[manga_id] = False

    async def _run_global_scan_task(
        self,
        manga_ids: Optional[List[str]],
        force_rescan: bool,
        language: Optional[str] = None,
        chapter_language: Optional[str] = None,
        scan_mode: str = "panel",
        reading_direction: str = "rtl",
        skip_blank_pages: bool = True,
        skip_duplicate_credits: bool = True,
    ):
        """Execute full library scanning across all downloaded manga chapters."""
        try:
            await self.ensure_indexes()
            await self._emit_global_progress(
                stage="discovering",
                current_manga_id=None,
                current_manga_title="",
                mangas_scanned=0,
                total_mangas=0,
                current_page=0,
                total_pages=0,
                panels_extracted=0,
                message="Đang kiểm tra danh sách manga và các chapter trong hệ thống...",
            )

            db = get_db()
            if manga_ids and len(manga_ids) > 0:
                target_ids = manga_ids
            else:
                target_ids = await db.chapters.distinct("manga_id")

            if not target_ids:
                await self._emit_global_progress(
                    stage="completed",
                    current_manga_id=None,
                    current_manga_title="",
                    mangas_scanned=0,
                    total_mangas=0,
                    current_page=0,
                    total_pages=0,
                    panels_extracted=0,
                    message="Không tìm thấy manga nào có chapter trong hệ thống.",
                )
                return

            total_mangas = len(target_ids)
            total_library_pages = 0
            manga_chapters_map: Dict[str, List[Dict[str, Any]]] = {}

            for mid in target_ids:
                c_query: Dict[str, Any] = {"manga_id": mid}
                if chapter_language and chapter_language != "all":
                    c_query["language"] = chapter_language
                chaps = (
                    await db.chapters.find(c_query).sort([("chapter_numeric", 1), ("chapter_number", 1)]).to_list(None)
                )
                manga_chapters_map[mid] = chaps
                for c in chaps:
                    total_library_pages += len(c.get("pages", []))

            if total_library_pages == 0:
                await self._emit_global_progress(
                    stage="completed",
                    current_manga_id=None,
                    current_manga_title="",
                    mangas_scanned=0,
                    total_mangas=total_mangas,
                    current_page=0,
                    total_pages=0,
                    panels_extracted=0,
                    message="Chưa có trang truyện nào phù hợp với bộ lọc để quét.",
                )
                return

            total_processed_pages = 0
            total_panels_extracted = 0
            seen_credit_hashes: Dict[str, int] = {}

            for m_idx, mid in enumerate(target_ids):
                if self._cancel_global_scan:
                    await self._emit_global_progress(
                        stage="cancelled",
                        current_manga_id=mid,
                        current_manga_title="",
                        mangas_scanned=m_idx,
                        total_mangas=total_mangas,
                        current_page=total_processed_pages,
                        total_pages=total_library_pages,
                        panels_extracted=total_panels_extracted,
                        message="Quá trình quét đã được dừng bởi người dùng.",
                    )
                    return

                m_filter = {"_id": ObjectId(mid)} if ObjectId.is_valid(mid) else {"_id": mid}
                manga_doc = await db.mangas.find_one(m_filter)
                manga_title = manga_doc.get("title", f"Manga {mid}") if manga_doc else f"Manga {mid}"

                chapters = manga_chapters_map.get(mid, [])
                for chap in chapters:
                    if self._cancel_global_scan:
                        break

                    c_id_str = str(chap["_id"])
                    chap_num = str(chap.get("chapter_number", "1"))
                    chap_title = chap.get("title", "")
                    vol_num = chap.get("volume")
                    pages = chap.get("pages", [])

                    for page in pages:
                        if self._cancel_global_scan:
                            break

                        page_num = page.get("page_number", 1)
                        filename = page.get("filename", f"{page_num}.jpg")
                        obj_key = page.get("object_key") or f"chapters/{mid}/{c_id_str}/{filename}"

                        if not force_rescan:
                            existing_count = await get_db().panel_scan_pages.find_one(
                                {
                                    "chapter_id": c_id_str,
                                    "page_number": page_num,
                                    "object_key": obj_key,
                                    "page_hash": page.get("md5_hash"),
                                    "pipeline_version": 2,
                                }
                            )
                            if existing_count:
                                total_processed_pages += 1
                                if total_processed_pages % 10 == 0 or total_processed_pages == total_library_pages:
                                    await self._emit_global_progress(
                                        stage="indexing",
                                        current_manga_id=mid,
                                        current_manga_title=manga_title,
                                        mangas_scanned=m_idx,
                                        total_mangas=total_mangas,
                                        current_page=total_processed_pages,
                                        total_pages=total_library_pages,
                                        panels_extracted=total_panels_extracted,
                                        message=f"Bỏ qua trang đã quét: {manga_title} • Ch.{chap_num} • Trang {page_num}",
                                    )
                                continue

                        await self._emit_global_progress(
                            stage="ocr_processing",
                            current_manga_id=mid,
                            current_manga_title=manga_title,
                            mangas_scanned=m_idx,
                            total_mangas=total_mangas,
                            current_page=total_processed_pages,
                            total_pages=total_library_pages,
                            panels_extracted=total_panels_extracted,
                            message=f"Đang nhận diện ({m_idx + 1}/{total_mangas}): {manga_title} • Ch.{chap_num} • Trang {page_num}",
                        )

                        image_bytes = await self._fetch_page_bytes(mid, c_id_str, filename, obj_key, page)
                        if not image_bytes:
                            raise RuntimeError(
                                f"Không đọc được {manga_title}, Ch.{chap_num}, trang {page_num}; dữ liệu cũ được giữ lại."
                            )

                        img = vision_service.decode_image_bytes(image_bytes)
                        if img is not None:
                            # Filter blank or uniform pages
                            if skip_blank_pages and vision_service.is_blank_or_uniform_page(img):
                                total_processed_pages += 1
                                await self._emit_global_progress(
                                    stage="indexing",
                                    current_manga_id=mid,
                                    current_manga_title=manga_title,
                                    mangas_scanned=m_idx,
                                    total_mangas=total_mangas,
                                    current_page=total_processed_pages,
                                    total_pages=total_library_pages,
                                    panels_extracted=total_panels_extracted,
                                    message=f"Bỏ qua trang trắng/đen: {manga_title} • Ch.{chap_num} • Trang {page_num}",
                                )
                                continue

                            # Filter duplicate credit pages
                            if skip_duplicate_credits:
                                ph = vision_service.compute_image_phash(img)
                                if ph:
                                    seen_credit_hashes[ph] = seen_credit_hashes.get(ph, 0) + 1
                                    if seen_credit_hashes[ph] >= 2 and (page_num <= 2 or page_num >= len(pages) - 1):
                                        total_processed_pages += 1
                                        await self._emit_global_progress(
                                            stage="indexing",
                                            current_manga_id=mid,
                                            current_manga_title=manga_title,
                                            mangas_scanned=m_idx,
                                            total_mangas=total_mangas,
                                            current_page=total_processed_pages,
                                            total_pages=total_library_pages,
                                            panels_extracted=total_panels_extracted,
                                            message=f"Bỏ qua credit trùng lặp: {manga_title} • Ch.{chap_num} • Trang {page_num}",
                                        )
                                        continue

                        eff_lang = language or chap.get("language") or "en"
                        target_input = img if img is not None else image_bytes
                        extracted_panels = await asyncio.to_thread(
                            self._analyze_page_image,
                            target_input,
                            mid,
                            manga_title,
                            c_id_str,
                            chap_num,
                            vol_num,
                            page_num,
                            obj_key,
                            chap_title,
                            eff_lang,
                            scan_mode,
                            reading_direction,
                        )

                        if not await self._save_page_panels(
                            mid, c_id_str, page_num, obj_key, extracted_panels, page.get("md5_hash")
                        ):
                            break
                        total_panels_extracted += len(extracted_panels)

                        total_processed_pages += 1
                        await self._emit_global_progress(
                            stage="indexing",
                            current_manga_id=mid,
                            current_manga_title=manga_title,
                            mangas_scanned=m_idx + 1,
                            total_mangas=total_mangas,
                            current_page=total_processed_pages,
                            total_pages=total_library_pages,
                            panels_extracted=total_panels_extracted,
                            message=f"Đã trích xuất {len(extracted_panels)} panels từ {manga_title} • Ch.{chap_num} • Trang {page_num}",
                        )
                        await asyncio.sleep(0.01)

            await self._emit_global_progress(
                stage="cancelled" if self._cancel_global_scan else "completed",
                current_manga_id=None,
                current_manga_title="",
                mangas_scanned=m_idx + (0 if self._cancel_global_scan else 1),
                total_mangas=total_mangas,
                current_page=total_processed_pages,
                total_pages=total_library_pages,
                panels_extracted=total_panels_extracted,
                message=f"{'Đã dừng.' if self._cancel_global_scan else 'Hoàn thành!'} Đã quét {total_processed_pages} trang qua {total_mangas} bộ manga, trích xuất thành công {total_panels_extracted} panels.",
            )

        except Exception as e:
            logger.error(f"Error during global panels scan: {e}", exc_info=True)
            await self._emit_global_progress(
                stage="error",
                current_manga_id=None,
                current_manga_title="",
                mangas_scanned=0,
                total_mangas=0,
                current_page=0,
                total_pages=0,
                panels_extracted=0,
                message=f"Đã xảy ra lỗi khi quét: {str(e)}",
            )
        finally:
            self._global_scan_active = False

    async def _save_page_panels(self, manga_id, chapter_id, page_number, object_key, panels, expected_hash=None):
        if (self._global_scan_active and self._cancel_global_scan) or self._cancel_scan.get(manga_id):
            return False
        chapter_key = ObjectId(chapter_id) if ObjectId.is_valid(chapter_id) else chapter_id
        chapter = await self._get_chapters_col().find_one({"_id": chapter_key, "manga_id": manga_id})
        if not chapter or not any(
            p.get("page_number") == page_number
            and (not expected_hash or p.get("md5_hash") == expected_hash)
            and (
                p.get("object_key")
                or f"chapters/{manga_id}/{chapter_id}/{p.get('filename', str(page_number) + '.jpg')}"
            )
            == object_key
            for p in chapter.get("pages", [])
        ):
            raise ValueError("Trang truyện đã thay đổi hoặc bị xóa trong lúc quét. Hãy quét lại.")
        selector = {"chapter_id": chapter_id, "page_number": page_number}
        generation = uuid4().hex
        for panel in panels:
            panel["scan_generation"] = generation
        col = self._get_panels_col()
        try:
            if panels:
                await col.insert_many(panels)
        except Exception:
            await col.delete_many({**selector, "scan_generation": generation})
            raise
        await col.delete_many({**selector, "scan_generation": {"$ne": generation}})
        await get_db().panel_scan_pages.update_one(
            selector,
            {
                "$set": {
                    "manga_id": manga_id,
                    "object_key": object_key,
                    "page_hash": expected_hash,
                    "pipeline_version": 2,
                    "scanned_at": datetime.utcnow(),
                }
            },
            upsert=True,
        )
        return True

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
                try:
                    return resp.read()
                finally:
                    resp.close()
                    resp.release_conn()

            return await asyncio.to_thread(_get_minio)
        except Exception as e:
            logger.debug(f"Could not fetch {obj_key} from MinIO ({e}), trying fallback key...")

        # Fallback MinIO key: chapters/{manga_id}/{chapter_id}/{filename}
        try:
            alt_key = f"chapters/{manga_id}/{chapter_id}/{filename}"

            def _get_alt_minio():
                resp = minio_service.client.get_object(minio_service.bucket, alt_key)
                try:
                    return resp.read()
                finally:
                    resp.close()
                    resp.release_conn()

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
        image_input: Any,
        manga_id: str,
        manga_title: str,
        chapter_id: str,
        chapter_num: str,
        vol_num: Optional[str],
        page_num: int,
        obj_key: str,
        chapter_title: str = "",
        language: str = "en",
        scan_mode: str = "panel",
        reading_direction: str = "rtl",
    ) -> List[Dict[str, Any]]:
        """Decode image, segment panels or speech bubbles, run OCR, NLP tokenize, lemmatize."""
        if isinstance(image_input, (bytes, bytearray)):
            img = vision_service.decode_image_bytes(image_input)
        else:
            img = image_input

        if img is None:
            raise ValueError("Trang truyện không phải ảnh hợp lệ hoặc đã hỏng")

        height, width = img.shape[:2]

        # 1. Run OCR on page
        detections = vision_service.detect_text(img)

        # 2. Extract panels or speech bubbles based on scan_mode
        mode = (scan_mode or "panel").lower()
        panels_coords: List[Tuple[float, float, float, float]] = []
        panel_texts_list: List[List[Dict[str, Any]]] = []

        if mode == "v3":
            from backend.services.vision.pipeline import vision_pipeline_v3
            from backend.services.vision.types import PageAnalysisContext

            ctx = PageAnalysisContext(
                manga_id=manga_id,
                chapter_id=chapter_id,
                page_number=page_num,
                page_hash=obj_key,
                image_width=width,
                image_height=height,
                chapter_language=language,
                reading_direction="rtl" if reading_direction == "rtl" else "ltr",
            )
            analysis = vision_pipeline_v3.analyze_page(img, ctx)
            result_docs = []
            now = datetime.utcnow()
            for p_idx, frame in enumerate(analysis.frames):
                frame_texts = [t for t in analysis.texts if t.panel_region_id == frame.id]
                raw_lines = [t.ocr_raw for t in frame_texts if t.ocr_raw]
                clean_lines = [
                    t.corrected_text or t.normalized_text
                    for t in frame_texts
                    if (t.corrected_text or t.normalized_text)
                ]

                raw_text = "\n".join(raw_lines)
                cleaned_text = " ".join(clean_lines)

                lemmas_set = set()
                vocab_list = []
                for t in frame_texts:
                    for tok in t.tokens:
                        lemmas_set.add(tok.lemma)
                        vocab_list.append(
                            {
                                "term": tok.surface,
                                "lemma": tok.lemma,
                                "pos_tag": tok.pos,
                                "frequency": 1,
                            }
                        )

                panel_doc = {
                    "manga_id": manga_id,
                    "manga_title": manga_title,
                    "chapter_id": chapter_id,
                    "chapter_number": chapter_num,
                    "chapter_title": chapter_title or "",
                    "volume": vol_num,
                    "page_number": page_num,
                    "page_minio_key": obj_key,
                    "panel_index": p_idx,
                    "coords": list(frame.bbox),
                    "width": width,
                    "height": height,
                    "raw_text": raw_text,
                    "cleaned_text": cleaned_text,
                    "lemmas": list(lemmas_set),
                    "vocabulary": vocab_list,
                    "language": language,
                    "scan_mode": "v3",
                    "pipeline_version": 3,
                    "created_at": now,
                }
                result_docs.append(panel_doc)
            return result_docs

        if mode == "bubble":
            # Direct Speech Bubble Clustering Mode (MangaTranslator style)
            bubbles = vision_service.cluster_text_into_bubbles(detections, reading_direction=reading_direction)
            if bubbles:
                panels_coords = [b["bbox"] for b in bubbles]
                panel_texts_list = [b["detections"] for b in bubbles]
            else:
                panels_coords = [(0.0, 0.0, 1.0, 1.0)]
                panel_texts_list = [detections]

        elif mode == "fullpage":
            # Entire page as a single focus context
            sorted_dets = vision_service.sort_elements_by_reading_order(detections, reading_direction=reading_direction)
            panels_coords = [(0.0, 0.0, 1.0, 1.0)]
            panel_texts_list = [sorted_dets]

        else:
            # Default "panel" mode: scene panels + preserve outside text bubbles
            raw_panels = vision_service.segment_panels(img)
            panel_texts_list = vision_service.associate_text_with_panels(
                raw_panels,
                detections,
                preserve_outside_text=True,
                reading_direction=reading_direction,
            )
            for idx, text_group in enumerate(panel_texts_list):
                if text_group and "outside_bubble_bbox" in text_group[0]:
                    panels_coords.append(text_group[0]["outside_bubble_bbox"])
                elif idx < len(raw_panels):
                    panels_coords.append(raw_panels[idx])
                else:
                    panels_coords.append((0.0, 0.0, 1.0, 1.0))

        result_docs = []
        now = datetime.utcnow()

        for p_idx, (nx1, ny1, nx2, ny2) in enumerate(panels_coords):
            assigned_texts = panel_texts_list[p_idx] if p_idx < len(panel_texts_list) else []

            # Use enhanced MangaOCRService for structured post-processing
            ocr_result = manga_ocr_service.process_detections(assigned_texts, language=language)
            raw_text = ocr_result["raw_text"]
            cleaned_text = ocr_result["clean_text"]

            lemmas, vocab_list = self.extract_language_features(cleaned_text, language=language)

            panel_doc = {
                "manga_id": manga_id,
                "manga_title": manga_title,
                "chapter_id": chapter_id,
                "chapter_number": chapter_num,
                "chapter_title": chapter_title or "",
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
                "language": language,
                "scan_mode": mode,
                "created_at": now,
            }
            result_docs.append(panel_doc)

        return result_docs

    async def search_panels(
        self,
        query: str,
        manga_id: Optional[str] = None,
        chapter_id: Optional[str] = None,
        language: Optional[str] = None,
        scan_mode: Optional[str] = None,
        limit: int = 36,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        Search panels by dialogue, keyword, or lemma across stored chapters and manga.
        Supports English and Vietnamese with accent-insensitive search.
        """
        clean_q = query.strip()

        # Base filter: if manga_id is provided and not "all", filter by manga
        base_filter: Dict[str, Any] = {}
        if manga_id and manga_id != "all":
            base_filter["manga_id"] = manga_id
        if chapter_id and chapter_id != "all":
            base_filter["chapter_id"] = chapter_id
        if language and language != "all":
            base_filter["language"] = language
        if scan_mode and scan_mode != "all":
            base_filter["scan_mode"] = scan_mode

        # Analyze query lemmas with spaCy + Vietnamese extraction
        q_doc = await asyncio.to_thread(lambda: self.nlp(clean_q))
        query_lemmas = [
            (token.lemma_ or token.text).lower() for token in q_doc if not token.is_punct and not token.is_space
        ]

        if clean_q:
            vi_lemmas, _ = self.extract_language_features(clean_q, language="vi")
            query_lemmas = list(set(query_lemmas + vi_lemmas))

        tokens = [t for t in clean_q.split() if t]
        escaped_q = re.escape(clean_q)

        # Multi-stage matching: phrase match OR all tokens match OR lemma match
        search_or = [
            {"cleaned_text": {"$regex": escaped_q, "$options": "i"}},
            {"raw_text": {"$regex": escaped_q, "$options": "i"}},
        ]

        unaccent_q = strip_vietnamese_accents(clean_q)
        if unaccent_q and unaccent_q != clean_q:
            search_or.append({"cleaned_text": {"$regex": re.escape(unaccent_q), "$options": "i"}})
            search_or.append({"raw_text": {"$regex": re.escape(unaccent_q), "$options": "i"}})

        if query_lemmas:
            search_or.append({"lemmas": {"$in": query_lemmas}})

        if len(tokens) > 1:
            token_ands = [{"cleaned_text": {"$regex": re.escape(t), "$options": "i"}} for t in tokens]
            search_or.append({"$and": token_ands})

        if clean_q:
            base_filter["$or"] = search_or

        col = self._get_panels_col()
        total = await col.count_documents(base_filter)

        cursor = (
            col.find(base_filter)
            .sort(
                [
                    ("created_at", -1),
                    ("manga_title", 1),
                    ("chapter_number", 1),
                    ("page_number", 1),
                    ("panel_index", 1),
                    ("_id", 1),
                ]
            )
            .skip(offset)
            .limit(limit)
        )

        raw_docs = await cursor.to_list(length=limit)

        # Batch-lookup manga covers for rich origin display
        unique_manga_ids = list({d.get("manga_id") for d in raw_docs if d.get("manga_id")})
        manga_cover_map: Dict[str, Optional[str]] = {}
        if unique_manga_ids:
            try:
                obj_m_ids = [ObjectId(m) for m in unique_manga_ids if ObjectId.is_valid(m)]
                str_m_ids = [m for m in unique_manga_ids if not ObjectId.is_valid(m)]
                manga_records = (
                    await self._get_mangas_col()
                    .find(
                        {"$or": [{"_id": {"$in": obj_m_ids}}, {"_id": {"$in": str_m_ids}}]},
                        {"_id": 1, "minio_cover_key": 1, "title": 1},
                    )
                    .to_list(len(unique_manga_ids))
                )
                for m in manga_records:
                    mid_str = str(m["_id"])
                    cov_key = m.get("minio_cover_key")
                    manga_cover_map[mid_str] = minio_service.get_presigned_url(cov_key) if cov_key else None
            except Exception as me:
                logger.warning(f"Error fetching manga covers for search results: {me}")

        results = []
        for doc in raw_docs:
            raw_text = doc.get("raw_text", "")
            cleaned = doc.get("cleaned_text", "")

            # Generate highlighted text snippet
            highlighted = self._highlight_text(raw_text or cleaned, tokens)
            doc_manga_id = doc.get("manga_id")

            results.append(
                {
                    "panel_id": str(doc["_id"]),
                    "manga_id": doc_manga_id,
                    "manga_title": doc.get("manga_title", ""),
                    "manga_cover_url": manga_cover_map.get(str(doc_manga_id)),
                    "chapter_id": doc.get("chapter_id"),
                    "chapter_number": doc.get("chapter_number", ""),
                    "chapter_title": doc.get("chapter_title", ""),
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
        pattern = "|".join(re.escape(t) for t in sorted(set(tokens), key=len, reverse=True) if t)
        if not text or not pattern:
            return html.escape(text or "")
        pieces, end = [], 0
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            pieces.extend([html.escape(text[end : match.start()]), "<mark>" + html.escape(match.group()) + "</mark>"])
            end = match.end()
        pieces.append(html.escape(text[end:]))
        return "".join(pieces)

    async def get_manga_stats(self, manga_id: str) -> Dict[str, Any]:
        """Return total panels, indexed pages, distinct vocabulary for a single manga."""
        col = self._get_panels_col()
        total_panels = await col.count_documents({"manga_id": manga_id})

        # Distinct chapters scanned
        scanned_chap_ids = await col.distinct("chapter_id", {"manga_id": manga_id})

        # Aggregation for vocabulary count
        pipeline = [
            {"$match": {"manga_id": manga_id}},
            {"$unwind": "$lemmas"},
            {"$group": {"_id": "$lemmas"}},
            {"$count": "total_words"},
        ]
        agg_res = await col.aggregate(pipeline).to_list(1)
        total_words = agg_res[0]["total_words"] if agg_res else 0

        # Total pages scanned
        page_pipeline = [
            {"$match": {"manga_id": manga_id}},
            {"$group": {"_id": {"chap": "$chapter_id", "pg": "$page_number"}}},
            {"$count": "total_pages"},
        ]
        page_res = await col.aggregate(page_pipeline).to_list(1)
        total_pages = page_res[0]["total_pages"] if page_res else 0

        return {
            "manga_id": manga_id,
            "total_panels": total_panels,
            "total_pages_scanned": total_pages,
            "total_chapters_scanned": len(scanned_chap_ids),
            "total_unique_words": total_words,
            "is_scanning": self._active_scans.get(manga_id, False) or self._global_scan_active,
        }

    async def get_global_stats(self) -> Dict[str, Any]:
        """Return library-wide statistics: total panels, pages, manga series, unique vocabulary."""
        col = self._get_panels_col()
        total_panels = await col.count_documents({})

        # Distinct manga and chapters scanned
        scanned_manga_ids = await col.distinct("manga_id")
        scanned_chap_ids = await col.distinct("chapter_id")

        # Vocabulary count across all panels in library
        pipeline = [{"$unwind": "$lemmas"}, {"$group": {"_id": "$lemmas"}}, {"$count": "total_words"}]
        agg_res = await col.aggregate(pipeline).to_list(1)
        total_words = agg_res[0]["total_words"] if agg_res else 0

        # Total pages scanned across library
        page_pipeline = [
            {"$group": {"_id": {"manga": "$manga_id", "chap": "$chapter_id", "pg": "$page_number"}}},
            {"$count": "total_pages"},
        ]
        page_res = await col.aggregate(page_pipeline).to_list(1)
        total_pages = page_res[0]["total_pages"] if page_res else 0

        return {
            "total_panels": total_panels,
            "total_pages_scanned": total_pages,
            "total_mangas_scanned": len(scanned_manga_ids),
            "total_chapters_scanned": len(scanned_chap_ids),
            "total_unique_words": total_words,
            "is_scanning": self._global_scan_active or any(self._active_scans.values()),
        }

    async def get_scanned_manga_list(self) -> List[Dict[str, Any]]:
        """Return list of manga with download/panel metrics for filter dropdowns and scan manager."""
        db = get_db()
        chap_manga_ids = await db.chapters.distinct("manga_id")
        if not chap_manga_ids:
            return []

        obj_ids = [ObjectId(m) for m in chap_manga_ids if ObjectId.is_valid(m)]
        str_ids = [m for m in chap_manga_ids if not ObjectId.is_valid(m)]

        mangas = await db.mangas.find({"$or": [{"_id": {"$in": obj_ids}}, {"_id": {"$in": str_ids}}]}).to_list(None)

        results = []
        for m in mangas:
            mid = str(m["_id"])
            cover_key = m.get("minio_cover_key")
            cover_url = minio_service.get_presigned_url(cover_key) if cover_key else None
            panel_count = await self._get_panels_col().count_documents({"manga_id": mid})
            chap_count = await db.chapters.count_documents({"manga_id": mid})
            results.append(
                {
                    "manga_id": mid,
                    "title": m.get("title", "Unknown"),
                    "cover_url": cover_url,
                    "chapters_count": chap_count,
                    "panels_count": panel_count,
                }
            )

        results.sort(key=lambda x: (x["panels_count"] == 0, x["title"]))
        return results

    async def delete_panels_for_chapter(self, chapter_id: str):
        """Cascading delete constraint: called when chapter is deleted."""
        try:
            await get_db().panel_scan_pages.delete_many({"chapter_id": chapter_id})
            res = await self._get_panels_col().delete_many({"chapter_id": chapter_id})
            logger.info(f"Cascading deletion: deleted {res.deleted_count} panels for chapter {chapter_id}")
        except Exception as e:
            logger.error(f"Error deleting panels for chapter {chapter_id}: {e}")

    async def delete_panels_for_pages(self, chapter_id: str, page_numbers: List[int]):
        """Cascading delete constraint: called when specific pages are deleted."""
        try:
            selector = {"chapter_id": chapter_id, "page_number": {"$in": page_numbers}}
            await get_db().panel_scan_pages.delete_many(selector)
            res = await self._get_panels_col().delete_many(selector)
            logger.info(
                f"Cascading deletion: deleted {res.deleted_count} panels for deleted pages in chapter {chapter_id}"
            )
        except Exception as e:
            logger.error(f"Error deleting panels for pages in chapter {chapter_id}: {e}")

    async def renumber_panels_for_chapter(self, chapter_id: str, old_to_new_pages: Dict[int, int]):
        """Cascading update constraint: update page numbers after pages were renumbered."""
        for collection in (self._get_panels_col(), get_db().panel_scan_pages):
            for old_p, new_p in old_to_new_pages.items():
                if old_p != new_p:
                    await collection.update_many(
                        {"chapter_id": chapter_id, "page_number": old_p}, {"$set": {"page_number": -new_p}}
                    )
            for new_p in old_to_new_pages.values():
                await collection.update_many(
                    {"chapter_id": chapter_id, "page_number": -new_p}, {"$set": {"page_number": new_p}}
                )

    async def delete_manga_panels(self, manga_id: str, chapter_id: Optional[str] = None) -> Dict[str, Any]:
        """Delete all extracted panels and scan page records for a manga or specific chapter."""
        selector: Dict[str, Any] = {"manga_id": manga_id}
        if chapter_id:
            selector["chapter_id"] = chapter_id

        col = self._get_panels_col()
        p_res = await col.delete_many(selector)
        pages_res = await get_db().panel_scan_pages.delete_many(selector)
        logger.info(
            f"Deleted {p_res.deleted_count} panels and {pages_res.deleted_count} scan pages for manga {manga_id}"
        )
        return {
            "success": True,
            "deleted_panels": p_res.deleted_count,
            "deleted_pages": pages_res.deleted_count,
            "message": f"Đã xóa {p_res.deleted_count} panels và {pages_res.deleted_count} trang đã quét.",
        }

    async def delete_all_panels(self) -> Dict[str, Any]:
        """Delete all extracted panels and scan page records across the entire system."""
        col = self._get_panels_col()
        p_res = await col.delete_many({})
        pages_res = await get_db().panel_scan_pages.delete_many({})
        logger.info(
            f"Global panel purge: deleted {p_res.deleted_count} panels and {pages_res.deleted_count} scan pages"
        )
        return {
            "success": True,
            "deleted_panels": p_res.deleted_count,
            "deleted_pages": pages_res.deleted_count,
            "message": f"Đã xóa toàn bộ {p_res.deleted_count} panels và {pages_res.deleted_count} trang đã quét trong hệ thống.",
        }


panel_scanner_service = PanelScannerService()
