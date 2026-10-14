import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId

from backend.core.redis import delete_cache, get_cache, set_cache
from backend.database.connection import get_db
from backend.models.tierlist import (
    HydratedTierItem,
    HydratedTierRow,
    MangaCoverOption,
    PresetKind,
    TierBoardSettings,
    TierColorKey,
    TierItemEntry,
    TierRowModel,
    TierlistAnalyticsSummary,
    TierlistCloneRequest,
    TierlistComparisonItemDiff,
    TierlistComparisonResponse,
    TierlistCreateRequest,
    TierlistDetailResponse,
    TierlistSummaryItem,
    TierlistUpdateRequest,
)
from backend.services.audit_service import audit_service
from backend.services.minio_service import minio_service

logger = logging.getLogger(__name__)


class TierlistNotFoundError(Exception):
    """Raised when a requested tierlist document is not found."""


class TierlistRevisionConflictError(Exception):
    """Raised when expected revision does not match current database revision."""

    def __init__(self, current_revision: int, expected_revision: int, message: Optional[str] = None):
        self.current_revision = current_revision
        self.expected_revision = expected_revision
        super().__init__(
            message
            or f"Revision conflict: current revision is {current_revision}, expected {expected_revision}"
        )


class TierlistAccessDeniedError(Exception):
    """Raised when an unauthorized resource access (e.g. cross-manga cover key) is attempted."""


def normalize_creator_name(name: str) -> str:
    """Normalize creator name for uniform indexing and case-insensitive querying."""
    return " ".join(name.strip().split()).lower()


def serialize_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Convert ObjectId to str for dictionaries."""
    if not doc:
        return doc
    res = dict(doc)
    if "_id" in res:
        res["_id"] = str(res["_id"])
    return res


class TierlistService:
    def _get_tierlists_collection(self):
        return get_db().creator_tierlists

    def _get_mangas_collection(self):
        return get_db().mangas

    def _get_cover_arts_collection(self):
        return get_db().cover_arts

    # -------------------------------------------------------------------------
    # Presets & Deduplication
    # -------------------------------------------------------------------------

    def build_preset_tiers(self, preset: PresetKind) -> List[TierRowModel]:
        """Construct initial tier rows based on requested preset."""
        if preset == "standard":
            return [
                TierRowModel(row_id="tier-s", label="S", color_key="crimson", description="Tuyệt đỉnh / Masterpiece"),
                TierRowModel(row_id="tier-a", label="A", color_key="amber", description="Xuất sắc / Excellent"),
                TierRowModel(row_id="tier-b", label="B", color_key="gold", description="Rất hay / Great"),
                TierRowModel(row_id="tier-c", label="C", color_key="lime", description="Khá ổn / Decent"),
                TierRowModel(row_id="tier-d", label="D", color_key="emerald", description="Trung bình / Mediocre"),
            ]
        if preset == "critic":
            return [
                TierRowModel(row_id="tier-critic-1", label="Tuyệt tác", color_key="crimson"),
                TierRowModel(row_id="tier-critic-2", label="Xuất sắc", color_key="amber"),
                TierRowModel(row_id="tier-critic-3", label="Đáng đọc", color_key="gold"),
                TierRowModel(row_id="tier-critic-4", label="Trung bình", color_key="lime"),
                TierRowModel(row_id="tier-critic-5", label="Gây thất vọng", color_key="slate"),
            ]
        if preset == "score_based":
            return [
                TierRowModel(row_id="tier-score-1", label="9.0 - 10", color_key="crimson"),
                TierRowModel(row_id="tier-score-2", label="8.0 - 8.5", color_key="amber"),
                TierRowModel(row_id="tier-score-3", label="7.0 - 7.5", color_key="gold"),
                TierRowModel(row_id="tier-score-4", label="5.0 - 6.5", color_key="lime"),
                TierRowModel(row_id="tier-score-5", label="< 5.0", color_key="slate"),
            ]
        # "empty" preset
        return [
            TierRowModel(row_id="tier-s", label="S", color_key="crimson"),
        ]

    def _deduplicate_tier_items(self, tiers: List[TierRowModel]) -> List[TierRowModel]:
        """Ensure each manga_id appears at most once across all tiers (first occurrence wins)."""
        seen_manga_ids = set()
        deduped_tiers: List[TierRowModel] = []
        for row in tiers:
            unique_items = []
            for item in row.items:
                mid = str(item.manga_id)
                if mid not in seen_manga_ids:
                    seen_manga_ids.add(mid)
                    unique_items.append(item)
            deduped_tiers.append(row.model_copy(update={"items": unique_items}))
        return deduped_tiers

    # -------------------------------------------------------------------------
    # Creator Manga Query & Auto-Seed
    # -------------------------------------------------------------------------

    async def get_creator_mangas(self, creator_name: str) -> List[Dict[str, Any]]:
        """
        Query all manga authored or illustrated by the creator.
        Uses boundary regex to safely match comma-separated creator fields.
        """
        clean_name = creator_name.strip()
        name_regex = {"$regex": rf"(^|,\s*){re.escape(clean_name)}(\s*,|$)", "$options": "i"}

        coll = self._get_mangas_collection()
        cursor = coll.find({
            "$or": [{"author": name_regex}, {"artist": name_regex}],
            "is_deleted": {"$ne": True},
        })

        mangas: List[Dict[str, Any]] = []
        pattern = re.compile(rf"(^|,\s*){re.escape(clean_name)}(\s*,|$)", re.IGNORECASE)

        async for doc in cursor:
            m_dict = dict(doc)
            author_val = str(m_dict.get("author") or "")
            artist_val = str(m_dict.get("artist") or "")

            is_author = bool(pattern.search(author_val))
            is_artist = bool(pattern.search(artist_val))

            if is_author and is_artist:
                creator_role = "both"
            elif is_author:
                creator_role = "author"
            elif is_artist:
                creator_role = "artist"
            else:
                creator_role = "both"

            m_dict["creator_role"] = creator_role

            # Presigned default cover
            cover_key = m_dict.get("minio_cover_key")
            if cover_key:
                m_dict["default_cover_url"] = minio_service.get_presigned_url(cover_key)
            else:
                m_dict["default_cover_url"] = m_dict.get("cover_url")

            mangas.append(m_dict)

        return mangas

    def auto_seed_items_by_rating(
        self,
        tiers: List[TierRowModel],
        mangas: List[Dict[str, Any]],
    ) -> List[TierRowModel]:
        """
        Distribute rated mangas into tiers by their personal_rating.
        Unrated mangas remain unranked.
        """
        if not tiers:
            return tiers

        num_tiers = len(tiers)
        # Deep copy tiers items to avoid mutation
        seeded_rows = [r.model_copy(update={"items": []}) for r in tiers]

        # Filter and sort rated works descending
        rated_mangas = [m for m in mangas if m.get("personal_rating") is not None]
        rated_mangas.sort(key=lambda m: float(m.get("personal_rating") or 0.0), reverse=True)

        for m in rated_mangas:
            rating = float(m["personal_rating"])
            mid = str(m["_id"])
            item_entry = TierItemEntry(manga_id=mid)

            if rating >= 9.0:
                target_idx = 0
            elif rating >= 8.0:
                target_idx = 1 if num_tiers > 1 else 0
            elif rating >= 7.0:
                target_idx = 2 if num_tiers > 2 else min(1, num_tiers - 1)
            elif rating >= 5.0:
                target_idx = 3 if num_tiers > 3 else min(2, num_tiers - 1)
            else:
                target_idx = num_tiers - 1

            seeded_rows[target_idx].items.append(item_entry)

        return seeded_rows

    # -------------------------------------------------------------------------
    # Hydration Engine
    # -------------------------------------------------------------------------

    async def hydrate_tierlist_doc(
        self,
        doc: Dict[str, Any],
        all_mangas: Optional[List[Dict[str, Any]]] = None,
    ) -> TierlistDetailResponse:
        """
        Enrich MongoDB tierlist document with live manga metadata, presigned covers,
        and unranked/excluded pools.
        """
        creator_name = doc.get("creator_name", "")
        if all_mangas is None:
            all_mangas = await self.get_creator_mangas(creator_name)

        manga_by_id = {str(m["_id"]): m for m in all_mangas}

        # Timestamp comparison for newly discovered works
        t_created = doc.get("created_at")
        if isinstance(t_created, datetime):
            tierlist_created_at = t_created if t_created.tzinfo else t_created.replace(tzinfo=timezone.utc)
        else:
            tierlist_created_at = datetime.now(timezone.utc)

        settings_dict = doc.get("settings", {})
        settings = TierBoardSettings(**settings_dict) if isinstance(settings_dict, dict) else settings_dict
        excluded_ids_set = {str(x) for x in (settings.excluded_manga_ids or [])}

        ranked_manga_ids = set()
        hydrated_tiers: List[HydratedTierRow] = []
        all_rated_scores: List[float] = []

        stored_tiers = doc.get("tiers", [])
        for r_dict in stored_tiers:
            row_id = r_dict.get("row_id", "")
            label = r_dict.get("label", "")
            color_key: TierColorKey = r_dict.get("color_key", "crimson")
            description = r_dict.get("description")

            hydrated_items: List[HydratedTierItem] = []
            row_scores: List[float] = []

            for item_dict in r_dict.get("items", []):
                mid = str(item_dict.get("manga_id", ""))
                manga = manga_by_id.get(mid)
                if not manga:
                    # Manga was deleted from system; drop smoothly
                    continue

                ranked_manga_ids.add(mid)
                score = manga.get("personal_rating")
                if score is not None:
                    row_scores.append(float(score))
                    all_rated_scores.append(float(score))

                # Resolve cover URL
                selected_key = item_dict.get("selected_minio_key")
                cover_url = None
                if selected_key:
                    cover_url = minio_service.get_presigned_url(selected_key)
                if not cover_url:
                    cover_url = manga.get("default_cover_url")

                hydrated_items.append(
                    HydratedTierItem(
                        manga_id=mid,
                        selected_cover_art_id=item_dict.get("selected_cover_art_id"),
                        selected_minio_key=selected_key,
                        note=item_dict.get("note"),
                        title=manga.get("title", ""),
                        cover_url=cover_url,
                        default_cover_url=manga.get("default_cover_url"),
                        personal_rating=manga.get("personal_rating"),
                        read_status=manga.get("read_status", "unread"),
                        year=str(manga.get("year")) if manga.get("year") else None,
                        status=manga.get("status"),
                        content_rating=manga.get("content_rating"),
                        creator_role=manga.get("creator_role", "both"),
                        is_newly_discovered=False,
                    )
                )

            avg_rating = round(sum(row_scores) / len(row_scores), 2) if row_scores else None
            hydrated_tiers.append(
                HydratedTierRow(
                    row_id=row_id,
                    label=label,
                    color_key=color_key,
                    description=description,
                    items=hydrated_items,
                    item_count=len(hydrated_items),
                    average_rating=avg_rating,
                )
            )

        # Build Unranked Pool and Excluded Pool
        unranked_pool: List[HydratedTierItem] = []
        excluded_pool: List[HydratedTierItem] = []

        for mid, manga in manga_by_id.items():
            if mid in ranked_manga_ids:
                continue

            # Check newly discovered
            m_created = manga.get("created_at")
            is_new = False
            if isinstance(m_created, datetime):
                m_tz = m_created if m_created.tzinfo else m_created.replace(tzinfo=timezone.utc)
                if m_tz > tierlist_created_at:
                    is_new = True

            pool_item = HydratedTierItem(
                manga_id=mid,
                title=manga.get("title", ""),
                cover_url=manga.get("default_cover_url"),
                default_cover_url=manga.get("default_cover_url"),
                personal_rating=manga.get("personal_rating"),
                read_status=manga.get("read_status", "unread"),
                year=str(manga.get("year")) if manga.get("year") else None,
                status=manga.get("status"),
                content_rating=manga.get("content_rating"),
                creator_role=manga.get("creator_role", "both"),
                is_newly_discovered=is_new,
            )

            if mid in excluded_ids_set:
                excluded_pool.append(pool_item)
            else:
                # Apply role filter if specified
                role = manga.get("creator_role", "both")
                if settings.role_filter == "all" or settings.role_filter == role:
                    unranked_pool.append(pool_item)

        # Calculate Analytics
        total_creator_mangas = len(all_mangas)
        ranked_count = len(ranked_manga_ids)
        unranked_count = len(unranked_pool)
        excluded_count = len(excluded_pool)
        completion_pct = round((ranked_count / total_creator_mangas * 100), 1) if total_creator_mangas > 0 else 0.0
        overall_avg = round(sum(all_rated_scores) / len(all_rated_scores), 2) if all_rated_scores else None

        analytics = TierlistAnalyticsSummary(
            total_creator_mangas=total_creator_mangas,
            ranked_count=ranked_count,
            unranked_count=unranked_count,
            excluded_count=excluded_count,
            completion_pct=completion_pct,
            overall_ranked_avg_rating=overall_avg,
        )

        return TierlistDetailResponse(
            _id=str(doc["_id"]),
            creator_name=doc.get("creator_name", ""),
            creator_name_normalized=doc.get("creator_name_normalized", ""),
            title=doc.get("title", ""),
            description=doc.get("description"),
            category_tag=doc.get("category_tag", "Tổng hợp"),
            is_default=bool(doc.get("is_default", False)),
            revision=int(doc.get("revision", 1)),
            settings=settings,
            tiers=hydrated_tiers,
            unranked_pool=unranked_pool,
            excluded_pool=excluded_pool,
            analytics=analytics,
            created_at=doc.get("created_at") or datetime.now(timezone.utc),
            updated_at=doc.get("updated_at") or datetime.now(timezone.utc),
        )

    # -------------------------------------------------------------------------
    # CRUD Operations
    # -------------------------------------------------------------------------

    async def list_creator_tierlists(self, creator_name: str) -> List[TierlistSummaryItem]:
        """List summary of all tierlists for a creator, cached in Redis for 180s."""
        norm_name = normalize_creator_name(creator_name)
        cache_key = f"tierlists:creator:{norm_name}"

        cached = await get_cache(cache_key)
        if cached is not None and isinstance(cached, list):
            try:
                return [TierlistSummaryItem(**item) for item in cached]
            except Exception as e:
                logger.warning(f"Failed to parse cached tierlist summaries: {e}")

        coll = self._get_tierlists_collection()
        cursor = coll.find({"creator_name_normalized": norm_name})

        summaries: List[TierlistSummaryItem] = []
        raw_items: List[Dict[str, Any]] = []

        async for doc in cursor:
            # Count ranked items
            ranked_count = sum(len(row.get("items", [])) for row in doc.get("tiers", []))
            tier_count = len(doc.get("tiers", []))

            summary = TierlistSummaryItem(
                _id=str(doc["_id"]),
                creator_name=doc.get("creator_name", ""),
                title=doc.get("title", ""),
                description=doc.get("description"),
                category_tag=doc.get("category_tag", "Tổng hợp"),
                is_default=bool(doc.get("is_default", False)),
                revision=int(doc.get("revision", 1)),
                ranked_count=ranked_count,
                tier_count=tier_count,
                created_at=doc.get("created_at") or datetime.now(timezone.utc),
                updated_at=doc.get("updated_at") or datetime.now(timezone.utc),
            )
            summaries.append(summary)
            raw_items.append(summary.model_dump(by_alias=True))

        # Sort: default first, then newest updated
        summaries.sort(key=lambda s: (1 if s.is_default else 0, s.updated_at), reverse=True)
        raw_items.sort(key=lambda s: (1 if s.get("is_default") else 0, s.get("updated_at")), reverse=True)

        await set_cache(cache_key, raw_items, ttl=180)
        return summaries

    async def get_tierlist_by_id(self, tierlist_id: str) -> TierlistDetailResponse:
        """Fetch and hydrate a specific tierlist by its ID."""
        coll = self._get_tierlists_collection()
        query_id = ObjectId(tierlist_id) if ObjectId.is_valid(tierlist_id) else tierlist_id
        doc = await coll.find_one({"_id": query_id})
        if not doc:
            raise TierlistNotFoundError(f"Tierlist with ID '{tierlist_id}' not found")
        return await self.hydrate_tierlist_doc(doc)

    async def create_tierlist(
        self,
        creator_name: str,
        payload: TierlistCreateRequest,
    ) -> TierlistDetailResponse:
        """Create a new tierlist version for a creator."""
        coll = self._get_tierlists_collection()
        norm_name = normalize_creator_name(creator_name)

        # Check if first tierlist for creator
        existing_count = await coll.count_documents({"creator_name_normalized": norm_name})
        is_default = payload.is_default or (existing_count == 0)

        if is_default:
            await coll.update_many({"creator_name_normalized": norm_name}, {"$set": {"is_default": False}})

        # Build initial tiers
        creator_mangas = await self.get_creator_mangas(creator_name)
        if payload.tiers is not None:
            tiers = payload.tiers
        else:
            tiers = self.build_preset_tiers(payload.preset)

        if payload.auto_seed_by_rating:
            tiers = self.auto_seed_items_by_rating(tiers, creator_mangas)

        tiers = self._deduplicate_tier_items(tiers)
        now = datetime.now(timezone.utc)

        doc = {
            "creator_name": creator_name.strip(),
            "creator_name_normalized": norm_name,
            "title": payload.title.strip(),
            "description": payload.description.strip() if payload.description else None,
            "category_tag": payload.category_tag.strip() if payload.category_tag else "Tổng hợp",
            "is_default": is_default,
            "revision": 1,
            "settings": payload.settings.model_dump(),
            "tiers": [r.model_dump() for r in tiers],
            "created_at": now,
            "updated_at": now,
        }

        res = await coll.insert_one(doc)
        doc["_id"] = res.inserted_id

        # Invalidate cache and log audit event
        await delete_cache(f"tierlists:creator:{norm_name}")
        await audit_service.log_event(
            entity_type="tierlist",
            entity_id=str(res.inserted_id),
            action="create_tierlist",
            entity_title=payload.title,
            details={"creator_name": creator_name, "is_default": is_default, "preset": payload.preset},
        )

        return await self.hydrate_tierlist_doc(doc, all_mangas=creator_mangas)

    async def update_tierlist(
        self,
        tierlist_id: str,
        payload: TierlistUpdateRequest,
    ) -> TierlistDetailResponse:
        """Update tierlist configuration, tiers, or settings with optimistic locking."""
        coll = self._get_tierlists_collection()
        query_id = ObjectId(tierlist_id) if ObjectId.is_valid(tierlist_id) else tierlist_id
        doc = await coll.find_one({"_id": query_id})
        if not doc:
            raise TierlistNotFoundError(f"Tierlist with ID '{tierlist_id}' not found")

        current_revision = int(doc.get("revision", 1))
        if payload.expected_revision is not None and payload.expected_revision != current_revision:
            raise TierlistRevisionConflictError(
                current_revision=current_revision,
                expected_revision=payload.expected_revision,
            )

        norm_name = doc.get("creator_name_normalized", "")
        update_fields: Dict[str, Any] = {
            "revision": current_revision + 1,
            "updated_at": datetime.now(timezone.utc),
        }

        if payload.title is not None:
            update_fields["title"] = payload.title.strip()
        if payload.description is not None:
            update_fields["description"] = payload.description.strip() if payload.description else None
        if payload.category_tag is not None:
            update_fields["category_tag"] = payload.category_tag.strip()
        if payload.settings is not None:
            update_fields["settings"] = payload.settings.model_dump()
        if payload.tiers is not None:
            deduped = self._deduplicate_tier_items(payload.tiers)
            update_fields["tiers"] = [r.model_dump() for r in deduped]
        if payload.is_default is not None:
            update_fields["is_default"] = payload.is_default
            if payload.is_default:
                await coll.update_many(
                    {"creator_name_normalized": norm_name, "_id": {"$ne": doc["_id"]}},
                    {"$set": {"is_default": False}},
                )

        await coll.update_one({"_id": doc["_id"]}, {"$set": update_fields})
        updated_doc = await coll.find_one({"_id": doc["_id"]})

        await delete_cache(f"tierlists:creator:{norm_name}")
        await audit_service.log_event(
            entity_type="tierlist",
            entity_id=str(doc["_id"]),
            action="update_tierlist",
            entity_title=updated_doc.get("title"),
            details={"revision": update_fields["revision"]},
        )

        return await self.hydrate_tierlist_doc(updated_doc)

    async def clone_tierlist(
        self,
        tierlist_id: str,
        payload: TierlistCloneRequest,
    ) -> TierlistDetailResponse:
        """Clone an existing tierlist into a new version."""
        coll = self._get_tierlists_collection()
        query_id = ObjectId(tierlist_id) if ObjectId.is_valid(tierlist_id) else tierlist_id
        source_doc = await coll.find_one({"_id": query_id})
        if not source_doc:
            raise TierlistNotFoundError(f"Source tierlist with ID '{tierlist_id}' not found")

        norm_name = source_doc.get("creator_name_normalized", "")
        if payload.set_as_default:
            await coll.update_many({"creator_name_normalized": norm_name}, {"$set": {"is_default": False}})

        now = datetime.now(timezone.utc)
        cloned_doc = {
            "creator_name": source_doc.get("creator_name", ""),
            "creator_name_normalized": norm_name,
            "title": payload.new_title.strip(),
            "description": source_doc.get("description"),
            "category_tag": source_doc.get("category_tag", "Tổng hợp"),
            "is_default": payload.set_as_default,
            "revision": 1,
            "settings": source_doc.get("settings", {}),
            "tiers": source_doc.get("tiers", []),
            "created_at": now,
            "updated_at": now,
        }

        res = await coll.insert_one(cloned_doc)
        cloned_doc["_id"] = res.inserted_id

        await delete_cache(f"tierlists:creator:{norm_name}")
        await audit_service.log_event(
            entity_type="tierlist",
            entity_id=str(res.inserted_id),
            action="clone_tierlist",
            entity_title=payload.new_title,
            details={"cloned_from_id": str(source_doc["_id"])},
        )

        return await self.hydrate_tierlist_doc(cloned_doc)

    async def auto_seed_tierlist(self, tierlist_id: str) -> TierlistDetailResponse:
        """Seed an existing tierlist using personal ratings."""
        coll = self._get_tierlists_collection()
        query_id = ObjectId(tierlist_id) if ObjectId.is_valid(tierlist_id) else tierlist_id
        doc = await coll.find_one({"_id": query_id})
        if not doc:
            raise TierlistNotFoundError(f"Tierlist with ID '{tierlist_id}' not found")

        creator_name = doc.get("creator_name", "")
        creator_mangas = await self.get_creator_mangas(creator_name)

        existing_tiers = [TierRowModel(**r) for r in doc.get("tiers", [])]
        if not existing_tiers:
            existing_tiers = self.build_preset_tiers("standard")

        seeded_tiers = self.auto_seed_items_by_rating(existing_tiers, creator_mangas)
        deduped = self._deduplicate_tier_items(seeded_tiers)

        update_fields = {
            "tiers": [r.model_dump() for r in deduped],
            "revision": int(doc.get("revision", 1)) + 1,
            "updated_at": datetime.now(timezone.utc),
        }

        await coll.update_one({"_id": doc["_id"]}, {"$set": update_fields})
        updated_doc = await coll.find_one({"_id": doc["_id"]})
        await delete_cache(f"tierlists:creator:{doc.get('creator_name_normalized')}")

        return await self.hydrate_tierlist_doc(updated_doc, all_mangas=creator_mangas)

    async def delete_tierlist(self, tierlist_id: str) -> bool:
        """Delete tierlist. If was default, reassign default to the newest remaining version."""
        coll = self._get_tierlists_collection()
        query_id = ObjectId(tierlist_id) if ObjectId.is_valid(tierlist_id) else tierlist_id
        doc = await coll.find_one({"_id": query_id})
        if not doc:
            raise TierlistNotFoundError(f"Tierlist with ID '{tierlist_id}' not found")

        norm_name = doc.get("creator_name_normalized", "")
        was_default = bool(doc.get("is_default", False))

        await coll.delete_one({"_id": doc["_id"]})
        await delete_cache(f"tierlists:creator:{norm_name}")

        if was_default:
            # Promote newest remaining tierlist to default
            remaining = await coll.find({"creator_name_normalized": norm_name}).to_list(length=100)
            if remaining:
                remaining.sort(key=lambda d: d.get("updated_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
                await coll.update_one({"_id": remaining[0]["_id"]}, {"$set": {"is_default": True}})

        await audit_service.log_event(
            entity_type="tierlist",
            entity_id=str(doc["_id"]),
            action="delete_tierlist",
            entity_title=doc.get("title"),
        )
        return True

    # -------------------------------------------------------------------------
    # Comparison Engine
    # -------------------------------------------------------------------------

    async def compare_tierlists(self, base_id: str, target_id: str) -> TierlistComparisonResponse:
        """Compare two tierlists of the same creator and calculate movements."""
        coll = self._get_tierlists_collection()
        b_qid = ObjectId(base_id) if ObjectId.is_valid(base_id) else base_id
        t_qid = ObjectId(target_id) if ObjectId.is_valid(target_id) else target_id

        base_doc = await coll.find_one({"_id": b_qid})
        target_doc = await coll.find_one({"_id": t_qid})

        if not base_doc:
            raise TierlistNotFoundError(f"Base tierlist '{base_id}' not found")
        if not target_doc:
            raise TierlistNotFoundError(f"Target tierlist '{target_id}' not found")

        if base_doc.get("creator_name_normalized") != target_doc.get("creator_name_normalized"):
            raise ValueError("Cannot compare tierlists from two different creators")

        creator_name = base_doc.get("creator_name", "")
        all_mangas = await self.get_creator_mangas(creator_name)
        manga_map = {str(m["_id"]): m for m in all_mangas}

        # Map positions: manga_id -> (tier_index, tier_label)
        def map_positions(doc):
            pos_map = {}
            for idx, row in enumerate(doc.get("tiers", [])):
                for item in row.get("items", []):
                    pos_map[str(item.get("manga_id"))] = (idx, row.get("label", ""))
            return pos_map

        base_pos = map_positions(base_doc)
        target_pos = map_positions(target_doc)

        summary_counts = {
            "promoted": 0,
            "demoted": 0,
            "unchanged": 0,
            "newly_ranked": 0,
            "unranked": 0,
        }
        diffs: List[TierlistComparisonItemDiff] = []

        all_ids = set(base_pos.keys()).union(set(target_pos.keys()))
        for mid in all_ids:
            manga = manga_map.get(mid, {})
            title = manga.get("title") or "Unknown Manga"
            cover_url = manga.get("default_cover_url")

            b_info = base_pos.get(mid)
            t_info = target_pos.get(mid)

            if b_info is not None and t_info is not None:
                b_idx, b_label = b_info
                t_idx, t_label = t_info
                delta = b_idx - t_idx  # Positive means moved up towards index 0
                if t_idx < b_idx:
                    movement = "promoted"
                elif t_idx > b_idx:
                    movement = "demoted"
                else:
                    movement = "unchanged"
                diffs.append(
                    TierlistComparisonItemDiff(
                        manga_id=mid,
                        title=title,
                        cover_url=cover_url,
                        from_tier_label=b_label,
                        to_tier_label=t_label,
                        from_tier_index=b_idx,
                        to_tier_index=t_idx,
                        movement=movement,
                        tier_delta=delta,
                    )
                )
                summary_counts[movement] += 1
            elif b_info is None and t_info is not None:
                t_idx, t_label = t_info
                diffs.append(
                    TierlistComparisonItemDiff(
                        manga_id=mid,
                        title=title,
                        cover_url=cover_url,
                        from_tier_label=None,
                        to_tier_label=t_label,
                        from_tier_index=None,
                        to_tier_index=t_idx,
                        movement="newly_ranked",
                        tier_delta=0,
                    )
                )
                summary_counts["newly_ranked"] += 1
            elif b_info is not None and t_info is None:
                b_idx, b_label = b_info
                diffs.append(
                    TierlistComparisonItemDiff(
                        manga_id=mid,
                        title=title,
                        cover_url=cover_url,
                        from_tier_label=b_label,
                        to_tier_label=None,
                        from_tier_index=b_idx,
                        to_tier_index=None,
                        movement="unranked",
                        tier_delta=0,
                    )
                )
                summary_counts["unranked"] += 1

        return TierlistComparisonResponse(
            base_tierlist_id=str(base_doc["_id"]),
            base_title=base_doc.get("title", ""),
            target_tierlist_id=str(target_doc["_id"]),
            target_title=target_doc.get("title", ""),
            summary=summary_counts,
            diffs=diffs,
        )

    # -------------------------------------------------------------------------
    # Cover Options & Image Streaming (Zero CORS Canvas)
    # -------------------------------------------------------------------------

    async def get_manga_cover_options(self, manga_id: str) -> List[MangaCoverOption]:
        """Fetch all available cover options (default cover + synced volume covers)."""
        coll_mangas = self._get_mangas_collection()
        coll_covers = self._get_cover_arts_collection()

        q_id = ObjectId(manga_id) if ObjectId.is_valid(manga_id) else manga_id
        manga = await coll_mangas.find_one({"_id": q_id})
        if not manga:
            raise ValueError(f"Manga with ID '{manga_id}' not found")

        options: List[MangaCoverOption] = []

        # 1. Default cover
        default_key = manga.get("minio_cover_key")
        if default_key:
            options.append(
                MangaCoverOption(
                    cover_art_id=None,
                    minio_key=default_key,
                    cover_url=minio_service.get_presigned_url(default_key),
                    volume=None,
                    locale=None,
                    is_default=True,
                )
            )

        # 2. Volume covers from cover_arts
        cursor = coll_covers.find({"manga_id": str(manga["_id"])})
        async for c_doc in cursor:
            k = c_doc.get("minio_key")
            if k:
                options.append(
                    MangaCoverOption(
                        cover_art_id=str(c_doc["_id"]),
                        minio_key=k,
                        cover_url=minio_service.get_presigned_url(k),
                        volume=c_doc.get("volume"),
                        locale=c_doc.get("locale"),
                        is_default=False,
                    )
                )

        return options

    async def validate_and_resolve_cover_key(self, manga_id: str, minio_key: Optional[str]) -> str:
        """
        Verify that a minio_key belongs directly to the requested manga.
        If minio_key is None, resolves to manga's primary cover key.
        Prevents arbitrary S3 key traversal / access.
        """
        coll_mangas = self._get_mangas_collection()
        coll_covers = self._get_cover_arts_collection()

        q_id = ObjectId(manga_id) if ObjectId.is_valid(manga_id) else manga_id
        manga = await coll_mangas.find_one({"_id": q_id})
        if not manga:
            raise TierlistNotFoundError(f"Manga with ID '{manga_id}' not found")

        primary_key = manga.get("minio_cover_key")
        if minio_key is None or minio_key == primary_key:
            if not primary_key:
                raise TierlistNotFoundError(f"No cover key found for manga '{manga_id}'")
            return primary_key

        # Check if minio_key belongs to cover_arts for this manga
        cover_match = await coll_covers.find_one({"manga_id": str(manga["_id"]), "minio_key": minio_key})
        if not cover_match:
            raise TierlistAccessDeniedError(f"Cover key '{minio_key}' is not associated with manga '{manga_id}'")

        return minio_key

    async def stream_cover_image_bytes(
        self,
        manga_id: str,
        minio_key: Optional[str] = None,
    ) -> Tuple[bytes, str]:
        """Read cover image bytes from MinIO under strict security boundary."""
        valid_key = await self.validate_and_resolve_cover_key(manga_id, minio_key)
        data, content_type = minio_service.get_object_stream(valid_key)
        return data, content_type


tierlist_service = TierlistService()
