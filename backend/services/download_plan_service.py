import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from backend.database.connection import get_db
from backend.models.datasource import (
    IdentityConflictError,
    SourceRelease,
    SourceWork,
)
from backend.models.download_plan import (
    DownloadPlan,
    DownloadPlanItem,
    DownloadSelectionPolicy,
)
from backend.services.datasources.registry import provider_registry

logger = logging.getLogger(__name__)


class DownloadPlanService:
    def _get_manga_sources_col(self):
        return get_db().manga_sources

    def _get_chapters_col(self):
        return get_db().chapters

    def _get_plans_col(self):
        return get_db().download_plans

    def _get_chapter_slots_col(self):
        return get_db().chapter_slots

    async def create_plan(
        self,
        manga_id: str,
        source: str,
        source_work_id: str,
        release_ids: List[str],
        selection_policy: DownloadSelectionPolicy = DownloadSelectionPolicy.SKIP_EXISTING,
        save_to_disk: bool = False,
        download_path: Optional[str] = None,
        ttl_hours: int = 24,
        auto_link: bool = False,
        releases_metadata: Optional[List[Dict[str, Any]]] = None,
    ) -> DownloadPlan:
        """
        Creates a validated, server-side download plan.
        Enforces source binding linkage and selection policy against existing chapters.
        """
        # 1. Enforce source-to-manga linkage
        binding = await self._get_manga_sources_col().find_one(
            {
                "manga_id": manga_id,
                "source": source,
                "source_work_id": source_work_id,
            }
        )
        if not binding:
            if auto_link:
                from backend.services.source_binding_service import source_binding_service

                provider_obj = provider_registry.get_provider(source)
                canonical_url = f"https://{source}.example/work/{source_work_id}"
                work_title = ""
                if provider_obj:
                    try:
                        resolved_work = await provider_obj.resolve_work(source_work_id)
                        if resolved_work:
                            canonical_url = resolved_work.url or canonical_url
                            work_title = resolved_work.title or ""
                    except Exception as e:
                        logger.warning(f"Could not resolve metadata during auto_link {source}:{source_work_id}: {e}")

                binding = await source_binding_service.link_source_to_manga(
                    manga_id=manga_id,
                    source=source,
                    source_work_id=source_work_id,
                    canonical_url=canonical_url,
                    title=work_title,
                )
            else:
                raise IdentityConflictError(
                    f"Source work '{source}:{source_work_id}' is not linked to manga '{manga_id}'"
                )

        # 2. Get provider and resolve work & releases
        provider = provider_registry.get_provider(source)
        if not provider:
            raise ValueError(f"Unknown datasource provider: '{source}'")

        work = await provider.resolve_work(source_work_id)
        if not work:
            work = SourceWork(
                source=source,
                source_work_id=source_work_id,
                title="Unknown",
                url=f"https://{source}.example/work/{source_work_id}",
            )

        # Build client hints lookup
        client_hints: Dict[str, Dict[str, Any]] = {}
        if releases_metadata:
            for rm in releases_metadata:
                if isinstance(rm, dict) and rm.get("id"):
                    client_hints[str(rm["id"])] = rm

        # Build catalog map lookup if provider supports listing
        catalog_map: Dict[str, SourceRelease] = {}
        if not client_hints and hasattr(provider, "list_releases") and source != "mangafire":
            try:
                from backend.models.datasource import ReleaseQuery

                cat_page = await provider.list_releases(source_work_id, ReleaseQuery(limit=500, language="en"))
                if cat_page and cat_page.items:
                    for item in cat_page.items:
                        catalog_map[str(item.id)] = item
            except Exception as cat_err:
                logger.warning(f"Failed to fetch catalog releases in create_plan: {cat_err}")

        items: List[DownloadPlanItem] = []
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=ttl_hours)

        for rid in release_ids:
            rid_str = str(rid)
            # Resolve release metadata via provider
            release: Optional[SourceRelease] = None
            if hasattr(provider, "get_release"):
                release = await provider.get_release(work, rid_str)

            if not release and rid_str in catalog_map:
                release = catalog_map[rid_str]

            if not release and rid_str in client_hints:
                hint = client_hints[rid_str]
                c_num = str(hint.get("chapter_number") or hint.get("chapter") or "1")
                raw_vol = hint.get("volume")
                vol_clean = None
                if raw_vol is not None:
                    s_vol = str(raw_vol).strip()
                    if s_vol and s_vol.lower() not in ("none", "null", "no volume"):
                        vol_clean = s_vol

                release = SourceRelease(
                    id=rid_str,
                    source=source,
                    source_work_id=source_work_id,
                    chapter_number=c_num,
                    volume=vol_clean,
                    title=hint.get("title") or "",
                    language=hint.get("language") or "en",
                    unit_kind=hint.get("unit_kind") or ("oneshot" if c_num.lower() == "oneshot" else "chapter"),
                    group_name=hint.get("group_name") or hint.get("scanlation_group"),
                )

            if not release:
                # Fallback placeholder if provider only has batch listing
                release = SourceRelease(
                    id=rid_str,
                    source=source,
                    source_work_id=source_work_id,
                    chapter_number="1",
                    language="en",
                )

            # Check existing chapter in database
            existing_chap = await self._get_chapters_col().find_one(
                {
                    "manga_id": manga_id,
                    "source": source,
                    "source_id": release.id,
                    "language": release.language,
                }
            )

            action = "download"
            status = "pending"
            reason = None
            target_chap_id = str(existing_chap["_id"]) if existing_chap else None

            if existing_chap and existing_chap.get("state") == "ready":
                if selection_policy == DownloadSelectionPolicy.SKIP_EXISTING:
                    action = "skip"
                    status = "skipped"
                    reason = "already_ready"
                elif selection_policy == DownloadSelectionPolicy.REPLACE_PREFERRED:
                    action = "download"
                    status = "pending"
                    reason = "replace_preferred_after_commit"
                elif selection_policy == DownloadSelectionPolicy.KEEP_ALTERNATIVE:
                    action = "download"
                    status = "pending"
                    reason = "keep_alternative"
                elif selection_policy == DownloadSelectionPolicy.RETRY_FAILED:
                    action = "skip"
                    status = "skipped"
                    reason = "already_ready"
            elif existing_chap and existing_chap.get("state") in ["failed", "staging"]:
                action = "download"
                status = "pending"
                reason = "retry_incomplete"

            item = DownloadPlanItem(
                item_id=str(uuid.uuid4()),
                source_release_id=release.id,
                chapter_number=release.chapter_number,
                volume=release.volume,
                title=release.title or "",
                language=release.language,
                unit_kind=release.unit_kind,
                target_slot_id=None,
                target_chapter_id=target_chap_id,
                action=action,
                status=status,
                reason=reason,
                expected_revision=existing_chap.get("pages_revision", 1) if existing_chap else 1,
            )
            items.append(item)

        download_count = sum(1 for i in items if i.action == "download")
        skip_count = sum(1 for i in items if i.action == "skip")

        plan_id = str(uuid.uuid4())
        plan_doc = {
            "_id": plan_id,
            "manga_id": manga_id,
            "source": source,
            "source_work_id": source_work_id,
            "selection_policy": selection_policy.value,
            "items": [i.model_dump() if hasattr(i, "model_dump") else i.dict() for i in items],
            "total_items": len(items),
            "download_count": download_count,
            "skip_count": skip_count,
            "save_to_disk": save_to_disk,
            "download_path": download_path,
            "expires_at": expires_at,
            "created_at": now,
            "updated_at": now,
        }

        await self._get_plans_col().insert_one(plan_doc)

        return DownloadPlan(
            _id=plan_id,
            manga_id=manga_id,
            source=source,
            source_work_id=source_work_id,
            selection_policy=selection_policy,
            items=items,
            total_items=len(items),
            download_count=download_count,
            skip_count=skip_count,
            save_to_disk=save_to_disk,
            download_path=download_path,
            expires_at=expires_at,
            created_at=now,
            updated_at=now,
        )

    async def get_plan(self, plan_id: str) -> Optional[DownloadPlan]:
        doc = await self._get_plans_col().find_one({"_id": plan_id})
        if not doc:
            return None
        return DownloadPlan(**doc)

    async def execute_plan(
        self,
        plan_id: str,
        idempotency_key: Optional[str] = None,
        background_tasks: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """
        Executes a planned download. Integrates with DownloadService to run background tasks.
        """
        plan = await self.get_plan(plan_id)
        if not plan:
            raise ValueError(f"Download plan '{plan_id}' not found")

        now = datetime.now(timezone.utc)
        plan_expires = plan.expires_at
        if plan_expires.tzinfo is None:
            plan_expires = plan_expires.replace(tzinfo=timezone.utc)

        if plan_expires < now:
            raise ValueError(f"Download plan '{plan_id}' has expired")

        items_to_download = [i for i in plan.items if i.action == "download" and i.status == "pending"]
        if not items_to_download:
            return {
                "task_id": f"noop_{plan_id}",
                "plan_id": plan_id,
                "status": "completed",
                "total_items": plan.total_items,
                "download_count": 0,
                "message": "All items already satisfied; no download required",
            }

        # Format chapter items for download_service
        chapters_list = [
            {
                "id": i.source_release_id,
                "chapter": i.chapter_number,
                "volume": i.volume,
                "title": i.title,
                "language": i.language,
                "source": plan.source,
                "source_work_id": plan.source_work_id,
            }
            for i in items_to_download
        ]

        from backend.services.download_service import download_service

        manga_title = f"Manga {plan.manga_id}"
        try:
            from bson import ObjectId

            manga_query = (
                {"_id": ObjectId(plan.manga_id)} if ObjectId.is_valid(plan.manga_id) else {"_id": plan.manga_id}
            )
            manga_doc = await get_db().mangas.find_one(manga_query)
            if manga_doc and manga_doc.get("title"):
                manga_title = manga_doc["title"]
        except Exception:
            pass

        download_target_path = plan.download_path if plan.save_to_disk else None

        task_id = await download_service.create_task(
            manga_id=plan.manga_id,
            manga_title=manga_title,
            chapters=chapters_list,
            save_to_disk=plan.save_to_disk,
            lang=items_to_download[0].language if items_to_download else "en",
            download_path=download_target_path,
        )

        # Trigger background download execution
        if background_tasks and hasattr(background_tasks, "add_task"):
            background_tasks.add_task(
                download_service.start_download_background,
                task_id=task_id,
                download_path=download_target_path,
            )
        else:
            import asyncio

            asyncio.create_task(
                download_service.start_download_background(
                    task_id=task_id,
                    download_path=download_target_path,
                )
            )

        return {
            "task_id": task_id,
            "plan_id": plan_id,
            "status": "pending",
            "total_items": plan.total_items,
            "download_count": len(items_to_download),
            "message": f"Started download task with {len(items_to_download)} chapter(s)",
        }


download_plan_service = DownloadPlanService()
