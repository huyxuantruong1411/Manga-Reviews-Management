import logging

logger = logging.getLogger(__name__)


class ChapterLifecycleService:
    """
    Coordinates chapter release lifecycle: deletion fences, epoch increments,
    storage manifest cleanups, and logical slot preference reconciliation.
    """

    async def delete_chapter(self, chapter_id: str) -> bool:
        from backend.services.chapter_service import chapter_service

        return await chapter_service.delete_chapter(chapter_id)


chapter_lifecycle_service = ChapterLifecycleService()
