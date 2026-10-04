import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId

from backend.database.connection import get_db
from backend.models.review_export import (
    ReviewCorpusExportRequest,
    ReviewCorpusExportResponse,
    ReviewCorpusSummaryResponse,
    ReviewManagementItem,
    ReviewManagementResponse,
    TopGenreStat,
)

logger = logging.getLogger(__name__)


class ReviewExportService:
    """Domain service for generating unified, AI-ready review corpus documents

    and metadata analytics for external LLM ingestion or style emulation.
    """

    def tiptap_to_markdown(self, node: Any) -> str:
        """Converts a Tiptap ProseMirror JSON tree into clean, high-fidelity Markdown."""
        if not isinstance(node, dict):
            return ""

        node_type = node.get("type")

        # Leaf text node with marks
        if node_type == "text":
            text = node.get("text", "")
            marks = node.get("marks", [])
            for mark in marks:
                m_type = mark.get("type")
                if m_type == "bold":
                    text = f"**{text}**"
                elif m_type == "italic":
                    text = f"*{text}*"
                elif m_type == "strike":
                    text = f"~~{text}~~"
                elif m_type == "code":
                    text = f"`{text}`"
                elif m_type == "link":
                    href = mark.get("attrs", {}).get("href", "")
                    text = f"[{text}]({href})"
            return text

        # Custom nodes
        if node_type == "image":
            src = node.get("attrs", {}).get("src", "")
            alt = node.get("attrs", {}).get("alt", "Manga panel / Image")
            return f"![{alt}]({src})\n\n"

        if node_type == "mangaReference":
            title = node.get("attrs", {}).get("title") or "Manga Reference"
            return f"**[{title}]**"

        if node_type == "horizontalRule":
            return "\n---\n\n"

        # Container nodes
        content_nodes = node.get("content", [])

        if node_type == "doc":
            blocks = [self.tiptap_to_markdown(child).strip() for child in content_nodes]
            return "\n\n".join(b for b in blocks if b)

        if node_type == "paragraph":
            inlines = "".join(self.tiptap_to_markdown(child) for child in content_nodes)
            return inlines

        if node_type == "heading":
            level = node.get("attrs", {}).get("level", 2)
            prefix = "#" * max(1, min(6, level))
            text = "".join(self.tiptap_to_markdown(child) for child in content_nodes).strip()
            return f"{prefix} {text}"

        if node_type == "blockquote":
            lines = []
            for child in content_nodes:
                child_md = self.tiptap_to_markdown(child).strip()
                if child_md:
                    for l in child_md.split("\n"):
                        lines.append(f"> {l}" if l else ">")
            return "\n".join(lines)

        if node_type == "bulletList":
            items = []
            for child in content_nodes:
                item_text = self.tiptap_to_markdown(child).strip()
                if item_text:
                    items.append(f"- {item_text}")
            return "\n".join(items)

        if node_type == "orderedList":
            start_num = node.get("attrs", {}).get("start", 1)
            items = []
            for idx, child in enumerate(content_nodes):
                item_text = self.tiptap_to_markdown(child).strip()
                if item_text:
                    items.append(f"{start_num + idx}. {item_text}")
            return "\n".join(items)

        if node_type == "listItem":
            # List item child can be paragraph or mixed
            return " ".join(self.tiptap_to_markdown(child).strip() for child in content_nodes)

        if node_type == "codeBlock":
            lang = node.get("attrs", {}).get("language", "")
            code = "".join(self.tiptap_to_markdown(child) for child in content_nodes)
            return f"```{lang}\n{code}\n```"

        # Fallback recursion for arbitrary containers
        return "".join(self.tiptap_to_markdown(child) for child in content_nodes)

    def tiptap_to_plain_text(self, node: Any) -> str:
        """Recursively extracts clean plain text from Tiptap JSON without markdown symbols."""
        if not isinstance(node, dict):
            return ""
        if node.get("type") == "text":
            return node.get("text", "")
        parts = []
        for child in node.get("content", []):
            extracted = self.tiptap_to_plain_text(child)
            if extracted:
                parts.append(extracted)
        if node.get("type") == "paragraph":
            joined = "".join(parts).strip()
            return re.sub(r" +", " ", joined)
        if node.get("type") in ("doc", "bulletList", "orderedList", "blockquote"):
            return "\n\n".join(p for p in parts if p).strip()
        joined = "".join(parts).strip()
        return re.sub(r" +", " ", joined)

    def count_words(self, text: str) -> int:
        """Counts words for English and Vietnamese text accurately."""
        if not text:
            return 0
        cleaned = re.sub(r"[#*_~`\[\]\(\)\<\>|\\-]", " ", text)
        words = [w for w in cleaned.split() if w.strip()]
        return len(words)

    def estimate_tokens(self, text: str) -> int:
        """Estimates token count for typical LLM context windows (GPT-4o, Claude 3.5, Gemini 1.5).

        For mixed Vietnamese/English, ~1.3 tokens per word or ~1 token per 3.5 chars.
        """
        if not text:
            return 0
        word_count = self.count_words(text)
        char_count = len(text)
        return max(int(word_count * 1.3), int(char_count / 3.5))

    def _render_rating_stars(self, rating: Optional[float]) -> str:
        if rating is None:
            return "Unrated"
        rounded = round(rating)
        full_stars = "★" * rounded
        empty_stars = "☆" * (10 - rounded)
        return f"{rating:.1f} / 10.0 ({full_stars}{empty_stars})"

    async def get_tag_dictionary(self, db) -> Dict[str, str]:
        """Loads all tag mappings: tag_id -> display_name."""
        tag_map: Dict[str, str] = {}
        try:
            cursor = db.tags.find({})
            async for tag in cursor:
                tag_id = str(tag.get("_id"))
                name_obj = tag.get("name")
                if isinstance(name_obj, dict):
                    tag_map[tag_id] = name_obj.get("vi") or name_obj.get("en") or tag_id
                elif isinstance(name_obj, str):
                    tag_map[tag_id] = name_obj
                else:
                    tag_map[tag_id] = tag_id
        except Exception as e:
            logger.warning(f"Failed to fetch tags for review export: {e}")
        return tag_map

    async def get_reviews_with_manga(
        self,
        db,
        read_statuses: Optional[List[str]] = None,
        rating_min: Optional[float] = None,
        rating_max: Optional[float] = None,
        manga_ids: Optional[List[str]] = None,
    ) -> List[Tuple[Dict[str, Any], Dict[str, Any]]]:
        """Fetches active reviews and joins them with their corresponding manga document."""
        review_query: Dict[str, Any] = {"is_deleted": {"$ne": True}}

        if manga_ids:
            review_query["manga_id"] = {"$in": manga_ids}

        cursor = db.reviews.find(review_query).sort("created_at", -1)
        raw_reviews = await cursor.to_list(length=None)

        if not raw_reviews:
            return []

        # Collect unique manga IDs
        unique_manga_ids = list({r.get("manga_id") for r in raw_reviews if r.get("manga_id")})
        obj_ids = []
        for mid in unique_manga_ids:
            if ObjectId.is_valid(mid):
                obj_ids.append(ObjectId(mid))

        manga_map: Dict[str, Dict[str, Any]] = {}
        if obj_ids:
            m_cursor = db.mangas.find({"_id": {"$in": obj_ids}})
            async for m in m_cursor:
                manga_map[str(m["_id"])] = m

        paired: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
        for r in raw_reviews:
            mid = str(r.get("manga_id", ""))
            manga = manga_map.get(mid)
            if not manga:
                # If manga was deleted or missing, provide placeholder
                manga = {
                    "_id": mid,
                    "title": f"Manga {mid}",
                    "read_status": "unknown",
                    "personal_rating": None,
                }

            # Filter by read_status if specified
            if read_statuses:
                m_status = str(manga.get("read_status", "")).lower()
                clean_statuses = [s.lower() for s in read_statuses]
                if m_status not in clean_statuses:
                    continue

            # Filter by personal_rating if specified
            p_rating = manga.get("personal_rating")
            if rating_min is not None:
                if p_rating is None or p_rating < rating_min:
                    continue
            if rating_max is not None:
                if p_rating is None or p_rating > rating_max:
                    continue

            paired.append((r, manga))

        return paired

    def build_corpus_markdown(
        self,
        reviews_with_manga: List[Tuple[Dict[str, Any], Dict[str, Any]]],
        tag_map: Dict[str, str],
        include_system_prompt: bool = True,
        include_synopsis: bool = True,
        include_manga_meta: bool = True,
        include_alt_titles: bool = True,
    ) -> str:
        """Constructs an exhaustive, highly structured Markdown corpus document."""
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        total_reviews = len(reviews_with_manga)

        total_words = 0
        all_ratings = []
        all_genres = set()

        processed_reviews = []
        for idx, (review, manga) in enumerate(reviews_with_manga, 1):
            content_json = review.get("content_json") or {}
            md_body = self.tiptap_to_markdown(content_json).strip()
            word_count = self.count_words(md_body)
            total_words += word_count

            r_rating = manga.get("personal_rating")
            if r_rating is not None:
                all_ratings.append(r_rating)

            manga_tags = [tag_map.get(tid, tid) for tid in manga.get("tag_ids", [])]
            for t in manga_tags:
                all_genres.add(t)

            processed_reviews.append((idx, review, manga, md_body, word_count, manga_tags))

        avg_rating = sum(all_ratings) / len(all_ratings) if all_ratings else 0.0
        est_tokens = self.estimate_tokens(" ".join(r[3] for r in processed_reviews))

        lines: List[str] = []

        # System Prompt / Author Emulation Header
        if include_system_prompt:
            lines.extend(
                [
                    "# AUTHOR WRITING STYLE CORPUS & CRITIQUE ARCHIVE",
                    "> **Document Type**: Comprehensive Author Review Corpus & Literary Perspective Archive",
                    f"> **Generated Date**: {now_str} | **Total Reviews**: {total_reviews} | **Total Words**: {total_words:,} (~{est_tokens:,} tokens)",
                    f"> **Average Rating**: {avg_rating:.2f}/10.0 | **Primary Genres**: {', '.join(sorted(all_genres)[:10]) or 'Various'}",
                    "",
                    "## 🤖 LLM Instructions: Tone, Voice & Style Emulation Guidelines",
                    "This document contains the authentic critique corpus and reviews written by the author.",
                    "If you are tasked with understanding or mimicking the author's writing style, observe and adhere to these principles:",
                    "",
                    "1. **Core Perspective & Critique Hierarchy**:",
                    "   - Pay attention to what the author prioritizes: Character depth, pacing, narrative consistency, emotional resonance, thematic coherence, or artwork paneling.",
                    "   - Notice how the author balances objective structural evaluation with subjective emotional experience.",
                    "",
                    "2. **Voice, Tone & Vocabulary**:",
                    "   - Analyze the author's vocabulary (metaphors, expressive adjectives, literary references).",
                    "   - Observe sentence cadence: length variation, rhetorical questions, use of emphasis, and transitions between paragraphs.",
                    "   - Note the level of humor, cynicism, empathy, or intellectual rigor present in the critiques.",
                    "",
                    "3. **Rating Calibration**:",
                    "   - Review how personal ratings (0.0 to 10.0) correspond to specific strengths and shortcomings pointed out in the text.",
                    "",
                    "4. **Persona Emulation Directive**:",
                    "   - When answering prompts or generating new reviews in the author's persona, embody the exact tone, critique dimensions, and vocabulary style illustrated across these entries.",
                    "",
                    "---",
                    "",
                ]
            )
        else:
            lines.extend(
                [
                    "# Manga Reviews Archive",
                    f"*Generated on {now_str} — {total_reviews} reviews ({total_words:,} words)*",
                    "",
                    "---",
                    "",
                ]
            )

        # Table of Contents
        if total_reviews > 1:
            lines.append("## Table of Contents")
            for idx, r, m, _, w_count, _ in processed_reviews:
                m_title = m.get("title", "Untitled")
                r_title = r.get("title") or "Review"
                r_rating = m.get("personal_rating")
                rating_str = f"[{r_rating:.1f}/10]" if r_rating is not None else "[Unrated]"
                lines.append(f"{idx}. [{m_title} — {r_title}](#review-{idx}) {rating_str} *({w_count} words)*")
            lines.extend(["", "---", ""])

        # Body: Each Review Entry
        for idx, review, manga, md_body, word_count, manga_tags in processed_reviews:
            r_title = review.get("title") or "Untitled Review"
            m_title = manga.get("title") or "Untitled Manga"
            created_at = review.get("created_at")
            updated_at = review.get("updated_at")

            created_str = (
                created_at.strftime("%Y-%m-%d %H:%M")
                if isinstance(created_at, datetime)
                else str(created_at or "Unknown")
            )
            updated_str = (
                updated_at.strftime("%Y-%m-%d %H:%M")
                if isinstance(updated_at, datetime)
                else str(updated_at or "Unknown")
            )

            lines.append(f'<a id="review-{idx}"></a>')
            lines.append(f"## Review #{idx}: {r_title}")
            lines.append(f"### Subject Manga: **{m_title}**")

            if include_alt_titles:
                alt_titles = manga.get("alt_titles", [])
                if alt_titles:
                    lines.append(f"*Alternative Titles*: {', '.join(alt_titles[:5])}")

            lines.append("")

            # Metadata Block
            if include_manga_meta:
                author = manga.get("author") or "Unknown"
                artist = manga.get("artist") or "Unknown"
                creators_str = f"{author}" if author == artist else f"Story: {author} | Art: {artist}"
                year = manga.get("year") or "N/A"
                pub_status = manga.get("status") or "N/A"
                demographic = manga.get("publication_demographic") or "N/A"
                content_rating = manga.get("content_rating") or "Safe"
                read_status = str(manga.get("read_status") or "unread").capitalize()
                chaps = manga.get("chapters")
                vols = manga.get("volumes")
                length_str = f"{vols} Vols / {chaps} Chs" if (vols or chaps) else "Ongoing/TBD"
                p_rating = manga.get("personal_rating")
                rating_display = self._render_rating_stars(p_rating)

                lines.extend(
                    [
                        "#### 📋 Context & Metadata",
                        f"- **Personal Score**: **{rating_display}**",
                        f"- **Reading Status**: `{read_status}` | **Length**: {length_str}",
                        f"- **Creators**: {creators_str}",
                        f"- **Demographic**: {demographic.capitalize()} | **Content Rating**: {content_rating.capitalize()}",
                        f"- **Publication Year**: {year} ({pub_status.capitalize()})",
                        f"- **Genres & Themes**: {', '.join(manga_tags) if manga_tags else 'N/A'}",
                        f"- **Review Date**: {created_str} *(Last updated: {updated_str})*",
                        f"- **Word Count**: {word_count:,} words (~{self.estimate_tokens(md_body):,} tokens)",
                        "",
                    ]
                )

            # Synopsis Block
            if include_synopsis:
                desc = (manga.get("description") or "").strip()
                if desc:
                    lines.extend(["#### 📖 Manga Premise / Synopsis", f"> {desc.replace(chr(10), chr(10) + '> ')}", ""])

            # Review Text
            lines.extend(
                [
                    "#### ✍️ Author's Review & Critical Analysis",
                    md_body or "*(No written review content)*",
                    "",
                    "---",
                    "",
                ]
            )

        return "\n".join(lines)

    def build_corpus_json(
        self,
        reviews_with_manga: List[Tuple[Dict[str, Any], Dict[str, Any]]],
        tag_map: Dict[str, str],
        include_system_prompt: bool = True,
        include_synopsis: bool = True,
        include_manga_meta: bool = True,
        include_alt_titles: bool = True,
    ) -> Dict[str, Any]:
        """Constructs a clean, structured JSON dataset for fine-tuning or programmatic RAG."""
        total_reviews = len(reviews_with_manga)
        total_words = 0

        reviews_list = []
        for idx, (review, manga) in enumerate(reviews_with_manga, 1):
            content_json = review.get("content_json") or {}
            md_content = self.tiptap_to_markdown(content_json).strip()
            plain_content = self.tiptap_to_plain_text(content_json).strip()
            word_count = self.count_words(md_content)
            total_words += word_count

            manga_tags = [tag_map.get(tid, tid) for tid in manga.get("tag_ids", [])]

            review_entry: Dict[str, Any] = {
                "index": idx,
                "review_id": str(review.get("_id", "")),
                "review_title": review.get("title", ""),
                "created_at": str(review.get("created_at", "")),
                "updated_at": str(review.get("updated_at", "")),
                "word_count": word_count,
                "estimated_tokens": self.estimate_tokens(md_content),
                "manga": {
                    "id": str(manga.get("_id", "")),
                    "title": manga.get("title", ""),
                    "personal_rating": manga.get("personal_rating"),
                    "read_status": manga.get("read_status"),
                },
                "content_markdown": md_content,
                "content_plain": plain_content,
            }

            if include_alt_titles:
                review_entry["manga"]["alt_titles"] = manga.get("alt_titles", [])

            if include_manga_meta:
                review_entry["manga"].update(
                    {
                        "author": manga.get("author"),
                        "artist": manga.get("artist"),
                        "year": manga.get("year"),
                        "status": manga.get("status"),
                        "publication_demographic": manga.get("publication_demographic"),
                        "content_rating": manga.get("content_rating"),
                        "original_language": manga.get("original_language"),
                        "chapters": manga.get("chapters"),
                        "volumes": manga.get("volumes"),
                        "tags": manga_tags,
                    }
                )

            if include_synopsis:
                review_entry["manga"]["synopsis"] = manga.get("description", "")

            reviews_list.append(review_entry)

        corpus: Dict[str, Any] = {
            "corpus_metadata": {
                "format_version": "1.0",
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "total_reviews": total_reviews,
                "total_words": total_words,
                "estimated_tokens": int(total_words * 1.3),
            },
            "reviews": reviews_list,
        }

        if include_system_prompt:
            corpus["ai_system_prompt"] = (
                "You are an AI assistant tasked with analyzing the author's writing style, "
                "tone, critical vocabulary, and evaluation criteria across this manga review corpus. "
                "Adhere to these stylistic characteristics when writing new critiques or reviews."
            )

        return corpus

    def build_corpus_txt(
        self,
        reviews_with_manga: List[Tuple[Dict[str, Any], Dict[str, Any]]],
        tag_map: Dict[str, str],
        include_system_prompt: bool = True,
        include_synopsis: bool = True,
        include_manga_meta: bool = True,
        include_alt_titles: bool = True,
    ) -> str:
        """Constructs a clean plain text version."""
        md = self.build_corpus_markdown(
            reviews_with_manga=reviews_with_manga,
            tag_map=tag_map,
            include_system_prompt=include_system_prompt,
            include_synopsis=include_synopsis,
            include_manga_meta=include_manga_meta,
            include_alt_titles=include_alt_titles,
        )
        # Strip bold/italic and markdown anchors for text version
        txt = re.sub(r"<a id=\"[^\"]+\"></a>", "", md)
        txt = re.sub(r"\*\*([^*]+)\*\*", r"\1", txt)
        txt = re.sub(r"\*([^*]+)\*", r"\1", txt)
        txt = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", txt)
        return txt

    async def get_review_corpus_summary(self) -> ReviewCorpusSummaryResponse:
        """Aggregates metrics for all active reviews in the system."""
        db = get_db()
        tag_map = await self.get_tag_dictionary(db)
        pairs = await self.get_reviews_with_manga(db)

        if not pairs:
            return ReviewCorpusSummaryResponse()

        total_words = 0
        total_chars = 0
        ratings = []
        unique_mangas = set()
        status_counts: Dict[str, int] = {}
        genre_counts: Dict[str, int] = {}
        dates: List[datetime] = []

        for review, manga in pairs:
            content_json = review.get("content_json") or {}
            md = self.tiptap_to_markdown(content_json).strip()
            total_words += self.count_words(md)
            total_chars += len(md)

            m_id = str(manga.get("_id", ""))
            if m_id:
                unique_mangas.add(m_id)

            r_status = str(manga.get("read_status") or "unread").lower()
            status_counts[r_status] = status_counts.get(r_status, 0) + 1

            p_rating = manga.get("personal_rating")
            if p_rating is not None:
                ratings.append(p_rating)

            for tid in manga.get("tag_ids", []):
                t_name = tag_map.get(tid, tid)
                genre_counts[t_name] = genre_counts.get(t_name, 0) + 1

            c_date = review.get("created_at")
            if isinstance(c_date, datetime):
                dates.append(c_date)

        dates.sort()
        earliest_date = dates[0] if dates else None
        latest_date = dates[-1] if dates else None

        avg_words = float(total_words) / len(pairs) if pairs else 0.0
        avg_rating = sum(ratings) / len(ratings) if ratings else None

        sorted_genres = sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        top_genres = [TopGenreStat(name=name, count=count) for name, count in sorted_genres]

        return ReviewCorpusSummaryResponse(
            total_reviews=len(pairs),
            total_words=total_words,
            total_characters=total_chars,
            estimated_tokens=int(total_words * 1.3),
            average_words_per_review=round(avg_words, 1),
            total_manga_reviewed=len(unique_mangas),
            average_manga_rating=round(avg_rating, 2) if avg_rating is not None else None,
            earliest_review_date=earliest_date,
            latest_review_date=latest_date,
            read_status_distribution=status_counts,
            top_genres=top_genres,
        )

    async def export_corpus(self, req: ReviewCorpusExportRequest) -> ReviewCorpusExportResponse:
        """Filters reviews, generates the corpus in the requested format, and returns the response."""
        db = get_db()
        tag_map = await self.get_tag_dictionary(db)
        pairs = await self.get_reviews_with_manga(
            db,
            read_statuses=req.read_statuses,
            rating_min=req.rating_min,
            rating_max=req.rating_max,
            manga_ids=req.manga_ids,
        )

        # Sorting
        if req.sort_by == "created_at_asc":
            pairs.sort(key=lambda x: x[0].get("created_at") or datetime.min)
        elif req.sort_by == "rating_desc":
            pairs.sort(key=lambda x: x[1].get("personal_rating") or -1.0, reverse=True)
        elif req.sort_by == "rating_asc":
            pairs.sort(key=lambda x: x[1].get("personal_rating") or 999.0)
        elif req.sort_by == "words_desc":
            pairs.sort(
                key=lambda x: self.count_words(self.tiptap_to_markdown(x[0].get("content_json") or {})), reverse=True
            )
        elif req.sort_by == "title_asc":
            pairs.sort(key=lambda x: (x[1].get("title") or "").lower())
        else:  # default: created_at_desc
            pairs.sort(key=lambda x: x[0].get("created_at") or datetime.min, reverse=True)

        fmt = req.format.lower().strip()
        date_stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        if fmt == "json":
            corpus_data = self.build_corpus_json(
                reviews_with_manga=pairs,
                tag_map=tag_map,
                include_system_prompt=req.include_system_prompt,
                include_synopsis=req.include_synopsis,
                include_manga_meta=req.include_manga_meta,
                include_alt_titles=req.include_alt_titles,
            )
            content = json.dumps(corpus_data, ensure_ascii=False, indent=2)
            filename = f"manga_reviews_corpus_{date_stamp}.json"
        elif fmt == "txt":
            content = self.build_corpus_txt(
                reviews_with_manga=pairs,
                tag_map=tag_map,
                include_system_prompt=req.include_system_prompt,
                include_synopsis=req.include_synopsis,
                include_manga_meta=req.include_manga_meta,
                include_alt_titles=req.include_alt_titles,
            )
            filename = f"manga_reviews_corpus_{date_stamp}.txt"
        else:  # markdown default
            content = self.build_corpus_markdown(
                reviews_with_manga=pairs,
                tag_map=tag_map,
                include_system_prompt=req.include_system_prompt,
                include_synopsis=req.include_synopsis,
                include_manga_meta=req.include_manga_meta,
                include_alt_titles=req.include_alt_titles,
            )
            filename = f"manga_reviews_corpus_{date_stamp}.md"

        total_words = sum(self.count_words(self.tiptap_to_markdown(r[0].get("content_json") or {})) for r in pairs)
        tokens = int(total_words * 1.3)

        return ReviewCorpusExportResponse(
            content=content,
            format=fmt,
            total_reviews=len(pairs),
            total_words=total_words,
            estimated_tokens=tokens,
            filename=filename,
        )

    async def get_reviews_management_list(
        self,
        db=None,
        search: Optional[str] = None,
        read_status: Optional[str] = None,
        rating_min: Optional[float] = None,
        rating_max: Optional[float] = None,
        sort_by: str = "created_at_desc",
    ) -> ReviewManagementResponse:
        """Retrieves and formats reviews with attached manga metadata for centralized management."""
        if db is None:
            db = get_db()
        read_statuses = [read_status] if read_status else None
        pairs = await self.get_reviews_with_manga(
            db,
            read_statuses=read_statuses,
            rating_min=rating_min,
            rating_max=rating_max,
        )

        items: List[ReviewManagementItem] = []
        search_lower = search.lower().strip() if search else None

        for review, manga in pairs:
            rev_id = str(review.get("_id", ""))
            manga_id = str(manga.get("_id", ""))
            rev_title = review.get("title") or "Untitled Review"
            content_json = review.get("content_json") or {}

            md_text = self.tiptap_to_markdown(content_json).strip()
            word_count = self.count_words(md_text)
            char_count = len(md_text)

            # Plain snippet (first 200 chars)
            plain_snippet = re.sub(r"[#*`>\[\]\(\)]", " ", md_text)
            plain_snippet = re.sub(r"\s+", " ", plain_snippet).strip()[:200]

            manga_title = manga.get("title") or "Untitled Manga"

            if search_lower:
                match_title = search_lower in manga_title.lower()
                match_rev = search_lower in rev_title.lower()
                match_snippet = search_lower in plain_snippet.lower()
                if not (match_title or match_rev or match_snippet):
                    continue

            items.append(
                ReviewManagementItem(
                    id=rev_id,
                    manga_id=manga_id,
                    manga_title=manga_title,
                    manga_cover_url=manga.get("cover_image_url") or manga.get("cover_url"),
                    manga_rating=manga.get("personal_rating"),
                    manga_read_status=manga.get("read_status"),
                    review_title=rev_title,
                    word_count=word_count,
                    character_count=char_count,
                    snippet=plain_snippet,
                    created_at=review.get("created_at"),
                    updated_at=review.get("updated_at"),
                    content_json=content_json,
                )
            )

        # Sorting
        if sort_by == "created_at_asc":
            items.sort(key=lambda x: x.created_at or datetime.min)
        elif sort_by == "rating_desc":
            items.sort(key=lambda x: x.manga_rating if x.manga_rating is not None else -1.0, reverse=True)
        elif sort_by == "rating_asc":
            items.sort(key=lambda x: x.manga_rating if x.manga_rating is not None else 999.0)
        elif sort_by == "words_desc":
            items.sort(key=lambda x: x.word_count, reverse=True)
        elif sort_by == "title_asc":
            items.sort(key=lambda x: x.manga_title.lower())
        else:  # default created_at_desc
            items.sort(key=lambda x: x.created_at or datetime.min, reverse=True)

        return ReviewManagementResponse(reviews=items, total=len(items))


review_export_service = ReviewExportService()
