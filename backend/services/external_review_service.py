import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from bson import ObjectId

from backend.database.connection import get_db
from backend.models.external_review import (
    ExternalReviewListResponse,
    ExternalReviewResponse,
    ExternalReviewStatsSummary,
    TriggerExternalReviewSyncRequest,
)
from backend.services.mal_enrichment_service import (
    apply_extended_mal_metadata_to_manga,
    extract_mal_id,
    fetch_mal_manga_page_html,
    fetch_mal_reviews_page_html,
    parse_mal_manga_info_html,
    parse_mal_reviews_page_html,
)

logger = logging.getLogger(__name__)


class ExternalReviewService:
    """
    Domain service for managing third-party external reviews (e.g. MyAnimeList),
    coordinating async synchronization with real-time SSE progress events, and
    querying reviews independently from personal collection `reviews`.
    """

    def __init__(self, db=None):
        self._db = db
        # Active sync tasks & SSE pub-sub state
        self._active_sync_states: Dict[str, Dict[str, Any]] = {}
        self._active_sync_queues: Dict[str, Set[asyncio.Queue]] = {}
        self._active_sync_tasks: Dict[str, asyncio.Task] = {}

    def _get_db(self):
        return self._db if self._db is not None else get_db()

    def get_sync_status(self, manga_id: str) -> Dict[str, Any]:
        """Return snapshot of the current or last sync operation for a manga."""
        if manga_id in self._active_sync_states:
            return dict(self._active_sync_states[manga_id])
        return {
            "manga_id": manga_id,
            "status": "idle",
            "stage": "idle",
            "stage_label": "Không có tác vụ đồng bộ nào đang chạy",
            "progress_pct": 0.0,
            "current_page": 0,
            "total_estimated_pages": 0,
            "fetched_reviews_count": 0,
            "total_expected_reviews": 0,
            "inserted_count": 0,
            "updated_count": 0,
            "skipped_count": 0,
            "logs": [],
            "error": None,
        }

    async def register_queue(self, manga_id: str) -> asyncio.Queue:
        """Register an SSE listener queue for real-time progress events."""
        q: asyncio.Queue = asyncio.Queue()
        if manga_id not in self._active_sync_queues:
            self._active_sync_queues[manga_id] = set()
        self._active_sync_queues[manga_id].add(q)
        # Immediately push current status
        await q.put(self.get_sync_status(manga_id))
        return q

    def unregister_queue(self, manga_id: str, q: asyncio.Queue) -> None:
        """Unregister an SSE listener queue."""
        if manga_id in self._active_sync_queues:
            self._active_sync_queues[manga_id].discard(q)
            if not self._active_sync_queues[manga_id]:
                del self._active_sync_queues[manga_id]

    async def broadcast_progress(self, manga_id: str, state: Dict[str, Any]) -> None:
        """Broadcast state updates to all active SSE queues for a manga."""
        self._active_sync_states[manga_id] = state
        queues = self._active_sync_queues.get(manga_id, set()).copy()
        for q in queues:
            try:
                q.put_nowait(dict(state))
            except Exception:
                pass

    def cancel_sync(self, manga_id: str) -> bool:
        """Cancel an ongoing sync task for a manga."""
        task = self._active_sync_tasks.get(manga_id)
        if task and not task.done():
            task.cancel()
            state = self._active_sync_states.get(manga_id, {})
            state["status"] = "cancelled"
            state["stage"] = "cancelled"
            state["stage_label"] = "Tác vụ đã bị người dùng hủy bỏ"
            logs = state.setdefault("logs", [])
            logs.append("Tác vụ thu thập đã bị dừng.")
            asyncio.create_task(self.broadcast_progress(manga_id, state))
            return True
        return False

    async def start_sync(
        self,
        manga_id: str,
        request: TriggerExternalReviewSyncRequest,
    ) -> Dict[str, Any]:
        """
        Initiate external review sync and optional metadata enrichment.
        Runs asynchronously in background while emitting progress telemetry.
        """
        # If already running, return current status
        current = self.get_sync_status(manga_id)
        if current.get("status") == "running":
            return current

        init_state: Dict[str, Any] = {
            "manga_id": manga_id,
            "source": request.source,
            "status": "running",
            "stage": "resolving_id",
            "stage_label": "Đang xác thực mã định danh MyAnimeList...",
            "progress_pct": 5.0,
            "current_page": 0,
            "total_estimated_pages": 1,
            "fetched_reviews_count": 0,
            "total_expected_reviews": 0,
            "inserted_count": 0,
            "updated_count": 0,
            "skipped_count": 0,
            "logs": ["Bắt đầu tác vụ đồng bộ..."],
            "started_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": None,
            "error": None,
        }
        await self.broadcast_progress(manga_id, init_state)

        # Launch background async task
        task = asyncio.create_task(self._run_sync_task(manga_id, request))
        self._active_sync_tasks[manga_id] = task
        return init_state

    async def _resolve_manga_and_mal_id(
        self,
        manga_id: str,
        req: TriggerExternalReviewSyncRequest,
    ) -> Tuple[Optional[dict], Optional[str]]:
        """Resolve manga document and the corresponding MAL ID."""
        db = self._get_db()
        manga = None
        if ObjectId.is_valid(manga_id):
            manga = await db.mangas.find_one({"_id": ObjectId(manga_id)})
        if not manga:
            return None, None

        # 1. From request direct param if provided
        if req.mal_url_or_id:
            parsed = extract_mal_id(req.mal_url_or_id)
            if parsed:
                return manga, parsed

        # 2. From tracker_metadata
        tm = manga.get("tracker_metadata") or {}
        if tm.get("mal") and isinstance(tm["mal"], dict) and tm["mal"].get("id"):
            return manga, str(tm["mal"]["id"])
        if tm.get("mal_id"):
            return manga, str(tm["mal_id"])

        # 3. From links array
        links = manga.get("links") or []
        for item in links:
            if isinstance(item, dict):
                title = str(item.get("title", "")).lower()
                url = str(item.get("url", ""))
            elif hasattr(item, "title") and hasattr(item, "url"):
                title = str(item.title).lower()
                url = str(item.url)
            else:
                continue

            if title in ("mal", "myanimelist"):
                extracted = extract_mal_id(url)
                if extracted:
                    return manga, extracted

        return manga, None

    async def _run_sync_task(
        self,
        manga_id: str,
        req: TriggerExternalReviewSyncRequest,
    ) -> None:
        """Internal worker executing metadata enrichment and reviews crawl."""
        state = dict(self._active_sync_states.get(manga_id, {}))
        logs: List[str] = state.setdefault("logs", [])

        try:
            db = self._get_db()
            manga, mal_id = await self._resolve_manga_and_mal_id(manga_id, req)
            if not manga:
                raise ValueError(f"Không tìm thấy truyện với ID: {manga_id}")
            if not mal_id:
                raise ValueError("Truyện này chưa có liên kết MyAnimeList. Vui lòng nhập URL hoặc ID MAL để đồng bộ.")

            logs.append(f"Đã xác nhận MyAnimeList ID: #{mal_id}")
            state["stage"] = "enriching_metadata"
            state["stage_label"] = f"Đang lấy thông tin chi tiết từ MAL #{mal_id}..."
            state["progress_pct"] = 15.0
            await self.broadcast_progress(manga_id, state)

            # 1. Enrich extended metadata if requested
            if req.sync_extended_metadata:
                info_html = await fetch_mal_manga_page_html(mal_id)
                if info_html:
                    meta = parse_mal_manga_info_html(info_html, mal_id)
                    update_payload = apply_extended_mal_metadata_to_manga(
                        manga,
                        meta,
                        apply_empty_fields=req.apply_empty_manga_fields,
                    )
                    await db.mangas.update_one(
                        {"_id": manga["_id"]},
                        {"$set": update_payload},
                    )
                    author_names = ", ".join(f"{a.name} ({a.role})" for a in meta.authors[:2])
                    logs.append(
                        f"Đồng bộ Metadata thành công: {meta.volumes or '?'} tập, "
                        f"{meta.chapters or '?'} chương. Tác giả: {author_names}"
                    )
                else:
                    logs.append("Không thể tải trang chi tiết Manga từ MAL, tiếp tục thu thập Reviews...")

            # 2. Crawl reviews page by page
            state["stage"] = "fetching_reviews"
            state["stage_label"] = "Đang thu thập trang đánh giá 1 từ MyAnimeList..."
            state["progress_pct"] = 25.0
            await self.broadcast_progress(manga_id, state)

            current_page = 1
            has_next = True
            total_expected: Optional[int] = None
            total_fetched = 0
            inserted_count = 0
            updated_count = 0

            while has_next and current_page <= req.max_pages:
                state["current_page"] = current_page
                state["stage_label"] = f"Đang thu thập trang đánh giá {current_page}..."
                await self.broadcast_progress(manga_id, state)

                rev_html = await fetch_mal_reviews_page_html(
                    mal_id=mal_id,
                    page=current_page,
                    include_spoilers=req.include_spoilers,
                    include_preliminary=req.include_preliminary,
                )

                if not rev_html:
                    logs.append(f"Không thể tải trang {current_page}, kết thúc thu thập.")
                    break

                reviews, exp_total, next_exists = parse_mal_reviews_page_html(rev_html, mal_id)
                if exp_total and total_expected is None:
                    total_expected = exp_total
                    state["total_expected_reviews"] = total_expected
                    # Estimate total pages (approx 20 per page)
                    state["total_estimated_pages"] = max(1, (exp_total + 19) // 20)

                page_count = len(reviews)
                total_fetched += page_count
                state["fetched_reviews_count"] = total_fetched

                ins, upd = await self.save_parsed_reviews(manga_id, req.source, reviews)
                inserted_count += ins
                updated_count += upd
                state["inserted_count"] = inserted_count
                state["updated_count"] = updated_count

                logs.append(f"Trang {current_page}: Nhận {page_count} bài (Thêm mới: {ins}, Cập nhật: {upd})")

                # Progress percentage calculation
                if total_expected and total_expected > 0:
                    pct = 25.0 + min(70.0, (total_fetched / total_expected) * 70.0)
                else:
                    pct = min(90.0, 25.0 + current_page * 15.0)
                state["progress_pct"] = round(pct, 1)
                await self.broadcast_progress(manga_id, state)

                if not next_exists or page_count == 0:
                    has_next = False
                    break

                current_page += 1
                # Polite throttle between page scrapes
                await asyncio.sleep(1.0)

            state["status"] = "completed"
            state["stage"] = "completed"
            state["stage_label"] = (
                f"Hoàn tất! Đã thu thập {total_fetched} bài đánh giá từ MyAnimeList "
                f"(Mới: {inserted_count}, Cập nhật: {updated_count})"
            )
            state["progress_pct"] = 100.0
            state["completed_at"] = datetime.now(timezone.utc).isoformat()
            logs.append("Tác vụ đồng bộ hoàn tất thành công 100%.")
            await self.broadcast_progress(manga_id, state)

        except asyncio.CancelledError:
            logger.info(f"Sync task for manga {manga_id} cancelled.")
        except Exception as e:
            logger.error(f"Error during external review sync for manga {manga_id}: {e}", exc_info=True)
            state["status"] = "failed"
            state["stage"] = "failed"
            state["stage_label"] = f"Đồng bộ thất bại: {str(e)}"
            state["error"] = str(e)
            logs.append(f"Lỗi: {str(e)}")
            await self.broadcast_progress(manga_id, state)

    async def save_parsed_reviews(
        self,
        manga_id: str,
        source: str,
        parsed_reviews: List[Dict[str, Any]],
    ) -> Tuple[int, int]:
        """
        Idempotent upsert of parsed reviews into `external_reviews` collection.
        Returns: (inserted_count, updated_count)
        """
        db = self._get_db()
        inserted = 0
        updated = 0
        now = datetime.now(timezone.utc)

        for rev in parsed_reviews:
            source_review_id = rev.get("source_review_id")
            if not source_review_id:
                continue

            query = {
                "manga_id": str(manga_id),
                "source": source,
                "source_review_id": str(source_review_id),
            }

            set_fields = {
                "source_work_id": rev.get("source_work_id", ""),
                "source_url": rev.get("source_url", ""),
                "reviewer_name": rev.get("reviewer_name", "Unknown"),
                "reviewer_profile_url": rev.get("reviewer_profile_url"),
                "reviewer_avatar_url": rev.get("reviewer_avatar_url"),
                "overall_rating": rev.get("overall_rating"),
                "recommendation_status": rev.get("recommendation_status", "unknown"),
                "is_preliminary": rev.get("is_preliminary", False),
                "chapters_progress": rev.get("chapters_progress"),
                "is_spoiler": rev.get("is_spoiler", False),
                "content_text": rev.get("content_text", ""),
                "word_count": rev.get("word_count", 0),
                "character_count": rev.get("character_count", 0),
                "reactions": rev.get("reactions", {}),
                "posted_at": rev.get("posted_at"),
                "posted_at_raw": rev.get("posted_at_raw"),
                "updated_at": now,
            }

            res = await db.external_reviews.update_one(
                query,
                {
                    "$set": set_fields,
                    "$setOnInsert": {
                        "manga_id": str(manga_id),
                        "source": source,
                        "source_review_id": str(source_review_id),
                        "fetched_at": now,
                    },
                },
                upsert=True,
            )

            if res.upserted_id:
                inserted += 1
            elif res.modified_count > 0:
                updated += 1

        return inserted, updated

    async def list_external_reviews(
        self,
        manga_id: str,
        source: Optional[str] = None,
        recommendation_status: Optional[str] = None,
        include_spoilers: bool = True,
        only_spoilers: Optional[bool] = None,
        only_preliminary: Optional[bool] = None,
        search: Optional[str] = None,
        sort_by: str = "posted_at_desc",
        skip: int = 0,
        limit: int = 20,
    ) -> ExternalReviewListResponse:
        """
        Query external reviews with multi-dimensional filtering, sorting,
        pagination, and aggregate statistics summary.
        """
        db = self._get_db()
        manga_str = str(manga_id)

        # Build filter query
        query: Dict[str, Any] = {"manga_id": manga_str}
        if source and source != "all":
            query["source"] = source
        if recommendation_status and recommendation_status != "all":
            query["recommendation_status"] = recommendation_status
        if not include_spoilers:
            query["is_spoiler"] = False
        if only_spoilers is True:
            query["is_spoiler"] = True
        if only_preliminary is True:
            query["is_preliminary"] = True
        elif only_preliminary is False:
            query["is_preliminary"] = False

        if search and search.strip():
            term = search.strip()
            query["$or"] = [
                {"content_text": {"$regex": term, "$options": "i"}},
                {"reviewer_name": {"$regex": term, "$options": "i"}},
            ]

        # Sorting
        sort_field = [("posted_at", -1)]
        if sort_by == "posted_at_asc":
            sort_field = [("posted_at", 1)]
        elif sort_by == "reactions_desc":
            sort_field = [("reactions.total", -1), ("posted_at", -1)]
        elif sort_by == "rating_desc":
            sort_field = [("overall_rating", -1), ("posted_at", -1)]
        elif sort_by == "rating_asc":
            sort_field = [("overall_rating", 1), ("posted_at", -1)]
        elif sort_by == "words_desc":
            sort_field = [("word_count", -1), ("posted_at", -1)]

        total_matching = await db.external_reviews.count_documents(query)

        cursor = db.external_reviews.find(query).sort(sort_field).skip(skip).limit(limit)

        items: List[ExternalReviewResponse] = []
        async for doc in cursor:
            items.append(ExternalReviewResponse.model_validate(doc))

        # Compute Summary Stats across all reviews of this manga
        summary = await self.get_summary_stats(manga_str)

        return ExternalReviewListResponse(
            items=items,
            total=total_matching,
            skip=skip,
            limit=limit,
            summary=summary,
        )

    async def get_summary_stats(self, manga_id: str) -> ExternalReviewStatsSummary:
        """Calculate aggregate statistics summary for external reviews of a manga."""
        db = self._get_db()
        pipeline = [
            {"$match": {"manga_id": str(manga_id)}},
            {
                "$facet": {
                    "totals": [
                        {
                            "$group": {
                                "_id": None,
                                "total": {"$sum": 1},
                                "spoiler_count": {"$sum": {"$cond": ["$is_spoiler", 1, 0]}},
                                "preliminary_count": {"$sum": {"$cond": ["$is_preliminary", 1, 0]}},
                                "avg_rating": {"$avg": "$overall_rating"},
                                "latest_fetched": {"$max": "$fetched_at"},
                            }
                        }
                    ],
                    "by_rec": [{"$group": {"_id": "$recommendation_status", "count": {"$sum": 1}}}],
                    "by_src": [{"$group": {"_id": "$source", "count": {"$sum": 1}}}],
                }
            },
        ]

        summary_data = {
            "total_reviews": 0,
            "by_source": {},
            "by_recommendation": {},
            "spoiler_count": 0,
            "preliminary_count": 0,
            "average_rating": None,
            "last_synced_at": None,
        }

        cursor = db.external_reviews.aggregate(pipeline)
        async for res in cursor:
            t = None
            if "totals" in res and res["totals"]:
                t = res["totals"][0]
            elif "total" in res:
                t = res

            if t:
                summary_data["total_reviews"] = t.get("total", 0)
                summary_data["spoiler_count"] = t.get("spoiler_count", 0)
                summary_data["preliminary_count"] = t.get("preliminary_count", 0)
                avg = t.get("avg_rating")
                summary_data["average_rating"] = round(avg, 2) if avg is not None else None
                summary_data["last_synced_at"] = t.get("latest_fetched")

            for rec in res.get("by_rec", []):
                if rec.get("_id"):
                    summary_data["by_recommendation"][rec["_id"]] = rec["count"]

            for src in res.get("by_src", []):
                if src.get("_id"):
                    summary_data["by_source"][src["_id"]] = src["count"]

        # Link metadata
        if ObjectId.is_valid(manga_id):
            manga = await db.mangas.find_one({"_id": ObjectId(manga_id)}, {"links": 1, "tracker_metadata": 1})
            if manga:
                tm = manga.get("tracker_metadata") or {}
                if tm.get("mal_id"):
                    summary_data["linked_mal_id"] = str(tm["mal_id"])
                    summary_data["linked_mal_url"] = f"https://myanimelist.net/manga/{tm['mal_id']}"
                elif tm.get("mal") and isinstance(tm["mal"], dict) and tm["mal"].get("id"):
                    summary_data["linked_mal_id"] = str(tm["mal"]["id"])
                    summary_data["linked_mal_url"] = f"https://myanimelist.net/manga/{tm['mal']['id']}"
                else:
                    for item in manga.get("links") or []:
                        title = item.get("title", "") if isinstance(item, dict) else getattr(item, "title", "")
                        url = item.get("url", "") if isinstance(item, dict) else getattr(item, "url", "")
                        if str(title).lower() in ("mal", "myanimelist"):
                            mal_id = extract_mal_id(url)
                            if mal_id:
                                summary_data["linked_mal_id"] = mal_id
                                summary_data["linked_mal_url"] = f"https://myanimelist.net/manga/{mal_id}"
                                break

        return ExternalReviewStatsSummary.model_validate(summary_data)

    async def delete_external_review(self, manga_id: str, review_id: str) -> bool:
        """Delete an individual external review document."""
        db = self._get_db()
        q = {"manga_id": str(manga_id)}
        if ObjectId.is_valid(review_id):
            q["_id"] = ObjectId(review_id)
        else:
            q["source_review_id"] = str(review_id)

        res = await db.external_reviews.delete_one(q)
        return res.deleted_count > 0

    async def clear_manga_external_reviews(self, manga_id: str, source: Optional[str] = None) -> int:
        """Clear all external reviews for a manga (optionally filtered by source)."""
        db = self._get_db()
        q = {"manga_id": str(manga_id)}
        if source and source != "all":
            q["source"] = source
        res = await db.external_reviews.delete_many(q)
        return res.deleted_count


# Global singleton instance
external_review_service = ExternalReviewService()
