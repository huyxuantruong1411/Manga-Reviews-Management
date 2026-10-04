import logging
from datetime import datetime, timedelta
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Query, Response

from backend.models.review_export import (
    ReviewCorpusExportRequest,
    ReviewCorpusExportResponse,
    ReviewCorpusSummaryResponse,
    ReviewManagementResponse,
)
from backend.services.analytics_service import analytics_service
from backend.services.review_export_service import review_export_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


def parse_iso_date(date_str: Optional[str], end_of_day: bool = False) -> Optional[datetime]:
    if not date_str:
        return None
    try:
        if "T" not in date_str and len(date_str) == 10:
            value = datetime.strptime(date_str, "%Y-%m-%d")
            return value + timedelta(days=1, microseconds=-1) if end_of_day else value
        return datetime.fromisoformat(date_str)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="Invalid ISO date") from error


def parse_list_param(param: Optional[Any]) -> Optional[List[str]]:
    if not param:
        return None
    if isinstance(param, str):
        return [s.strip() for s in param.split(",") if s.strip()]
    if isinstance(param, list):
        res = []
        for item in param:
            if isinstance(item, str):
                res.extend([s.strip() for s in item.split(",") if s.strip()])
            else:
                res.append(item)
        return res
    return None


def get_filter_params(
    search: Optional[str] = Query(None),
    read_status: Optional[str] = Query(None),
    read_statuses: Optional[List[str]] = Query(None),
    exclude_read_statuses: Optional[List[str]] = Query(None),
    tags: Optional[List[str]] = Query(None),
    exclude_tags: Optional[List[str]] = Query(None),
    tag_mode: str = Query("all"),
    content_ratings: Optional[List[str]] = Query(None),
    demographics: Optional[List[str]] = Query(None),
    statuses: Optional[List[str]] = Query(None),
    original_languages: Optional[List[str]] = Query(None),
    authors: Optional[List[str]] = Query(None),
    artists: Optional[List[str]] = Query(None),
    rating_min: Optional[float] = Query(None),
    rating_max: Optional[float] = Query(None),
    year_start: Optional[str] = Query(None),
    year_end: Optional[str] = Query(None),
):
    parsed_read_statuses = parse_list_param(read_statuses)
    parsed_exclude_read_statuses = parse_list_param(exclude_read_statuses)

    return analytics_service.build_match_stage(
        search=search,
        read_status=read_status,
        read_statuses=parsed_read_statuses,
        exclude_read_statuses=parsed_exclude_read_statuses,
        tags=tags,
        exclude_tags=exclude_tags,
        tag_mode=tag_mode,
        content_ratings=content_ratings,
        demographics=demographics,
        statuses=statuses,
        original_languages=original_languages,
        authors=authors,
        artists=artists,
        rating_min=rating_min,
        rating_max=rating_max,
        year_start=year_start,
        year_end=year_end,
    )


@router.get("")
async def get_all_analytics(
    search: Optional[str] = Query(None),
    read_status: Optional[str] = Query(None),
    read_statuses: Optional[List[str]] = Query(None),
    exclude_read_statuses: Optional[List[str]] = Query(None),
    tags: Optional[List[str]] = Query(None),
    exclude_tags: Optional[List[str]] = Query(None),
    tag_mode: str = Query("all"),
    content_ratings: Optional[List[str]] = Query(None),
    demographics: Optional[List[str]] = Query(None),
    statuses: Optional[List[str]] = Query(None),
    original_languages: Optional[List[str]] = Query(None),
    authors: Optional[List[str]] = Query(None),
    artists: Optional[List[str]] = Query(None),
    rating_min: Optional[float] = Query(None),
    rating_max: Optional[float] = Query(None),
    year_start: Optional[str] = Query(None),
    year_end: Optional[str] = Query(None),
    timeline_group_by: str = Query("month"),
    added_start_date: Optional[str] = Query(None),
    added_end_date: Optional[str] = Query(None),
    review_start_date: Optional[str] = Query(None),
    review_end_date: Optional[str] = Query(None),
    completed_start_date: Optional[str] = Query(None),
    completed_end_date: Optional[str] = Query(None),
):
    """Get all analytical stats (overview, score distributions, tag metrics, timelines, creators, and ratings)."""
    try:
        filter_query = get_filter_params(
            search=search,
            read_status=read_status,
            read_statuses=read_statuses,
            exclude_read_statuses=exclude_read_statuses,
            tags=tags,
            exclude_tags=exclude_tags,
            tag_mode=tag_mode,
            content_ratings=content_ratings,
            demographics=demographics,
            statuses=statuses,
            original_languages=original_languages,
            authors=authors,
            artists=artists,
            rating_min=rating_min,
            rating_max=rating_max,
            year_start=year_start,
            year_end=year_end,
        )

        added_start = parse_iso_date(added_start_date)
        added_end = parse_iso_date(added_end_date, end_of_day=True)
        review_start = parse_iso_date(review_start_date)
        review_end = parse_iso_date(review_end_date, end_of_day=True)
        completed_start = parse_iso_date(completed_start_date)
        completed_end = parse_iso_date(completed_end_date, end_of_day=True)

        return await analytics_service.get_all_analytics(
            filter_query=filter_query,
            group_by=timeline_group_by,
            added_start=added_start,
            added_end=added_end,
            review_start=review_start,
            review_end=review_end,
            completed_start=completed_start,
            completed_end=completed_end,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/overview")
async def get_overview(
    search: Optional[str] = Query(None),
    read_status: Optional[str] = Query(None),
    read_statuses: Optional[List[str]] = Query(None),
    exclude_read_statuses: Optional[List[str]] = Query(None),
    tags: Optional[List[str]] = Query(None),
    exclude_tags: Optional[List[str]] = Query(None),
    tag_mode: str = Query("all"),
    content_ratings: Optional[List[str]] = Query(None),
    demographics: Optional[List[str]] = Query(None),
    statuses: Optional[List[str]] = Query(None),
    original_languages: Optional[List[str]] = Query(None),
    authors: Optional[List[str]] = Query(None),
    artists: Optional[List[str]] = Query(None),
    rating_min: Optional[float] = Query(None),
    rating_max: Optional[float] = Query(None),
    year_start: Optional[str] = Query(None),
    year_end: Optional[str] = Query(None),
):
    """Get general stats overview (total counts, averages, status distributions)."""
    try:
        filter_query = get_filter_params(
            search=search,
            read_status=read_status,
            read_statuses=read_statuses,
            exclude_read_statuses=exclude_read_statuses,
            tags=tags,
            exclude_tags=exclude_tags,
            tag_mode=tag_mode,
            content_ratings=content_ratings,
            demographics=demographics,
            statuses=statuses,
            original_languages=original_languages,
            authors=authors,
            artists=artists,
            rating_min=rating_min,
            rating_max=rating_max,
            year_start=year_start,
            year_end=year_end,
        )
        return await analytics_service.get_overview_stats(filter_query)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/score-distribution")
async def get_score_distribution(
    search: Optional[str] = Query(None),
    read_status: Optional[str] = Query(None),
    read_statuses: Optional[List[str]] = Query(None),
    exclude_read_statuses: Optional[List[str]] = Query(None),
    tags: Optional[List[str]] = Query(None),
    exclude_tags: Optional[List[str]] = Query(None),
    tag_mode: str = Query("all"),
    content_ratings: Optional[List[str]] = Query(None),
    demographics: Optional[List[str]] = Query(None),
    statuses: Optional[List[str]] = Query(None),
    original_languages: Optional[List[str]] = Query(None),
    authors: Optional[List[str]] = Query(None),
    artists: Optional[List[str]] = Query(None),
    rating_min: Optional[float] = Query(None),
    rating_max: Optional[float] = Query(None),
    year_start: Optional[str] = Query(None),
    year_end: Optional[str] = Query(None),
):
    """Get count of manga per score rating."""
    try:
        filter_query = get_filter_params(
            search=search,
            read_status=read_status,
            read_statuses=read_statuses,
            exclude_read_statuses=exclude_read_statuses,
            tags=tags,
            exclude_tags=exclude_tags,
            tag_mode=tag_mode,
            content_ratings=content_ratings,
            demographics=demographics,
            statuses=statuses,
            original_languages=original_languages,
            authors=authors,
            artists=artists,
            rating_min=rating_min,
            rating_max=rating_max,
            year_start=year_start,
            year_end=year_end,
        )
        return await analytics_service.get_score_distribution(filter_query)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top-tags")
async def get_top_tags(
    search: Optional[str] = Query(None),
    read_status: Optional[str] = Query(None),
    read_statuses: Optional[List[str]] = Query(None),
    exclude_read_statuses: Optional[List[str]] = Query(None),
    tags: Optional[List[str]] = Query(None),
    exclude_tags: Optional[List[str]] = Query(None),
    tag_mode: str = Query("all"),
    content_ratings: Optional[List[str]] = Query(None),
    demographics: Optional[List[str]] = Query(None),
    statuses: Optional[List[str]] = Query(None),
    original_languages: Optional[List[str]] = Query(None),
    authors: Optional[List[str]] = Query(None),
    artists: Optional[List[str]] = Query(None),
    rating_min: Optional[float] = Query(None),
    rating_max: Optional[float] = Query(None),
    year_start: Optional[str] = Query(None),
    year_end: Optional[str] = Query(None),
):
    """Get top 10 tags by manga count."""
    try:
        filter_query = get_filter_params(
            search=search,
            read_status=read_status,
            read_statuses=read_statuses,
            exclude_read_statuses=exclude_read_statuses,
            tags=tags,
            exclude_tags=exclude_tags,
            tag_mode=tag_mode,
            content_ratings=content_ratings,
            demographics=demographics,
            statuses=statuses,
            original_languages=original_languages,
            authors=authors,
            artists=artists,
            rating_min=rating_min,
            rating_max=rating_max,
            year_start=year_start,
            year_end=year_end,
        )
        return await analytics_service.get_top_tags(filter_query)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/manga-timeline")
async def get_manga_timeline(
    search: Optional[str] = Query(None),
    read_status: Optional[str] = Query(None),
    read_statuses: Optional[List[str]] = Query(None),
    exclude_read_statuses: Optional[List[str]] = Query(None),
    tags: Optional[List[str]] = Query(None),
    exclude_tags: Optional[List[str]] = Query(None),
    tag_mode: str = Query("all"),
    content_ratings: Optional[List[str]] = Query(None),
    demographics: Optional[List[str]] = Query(None),
    statuses: Optional[List[str]] = Query(None),
    original_languages: Optional[List[str]] = Query(None),
    authors: Optional[List[str]] = Query(None),
    artists: Optional[List[str]] = Query(None),
    rating_min: Optional[float] = Query(None),
    rating_max: Optional[float] = Query(None),
    year_start: Optional[str] = Query(None),
    year_end: Optional[str] = Query(None),
    timeline_group_by: str = Query("month"),
    added_start_date: Optional[str] = Query(None),
    added_end_date: Optional[str] = Query(None),
):
    """Get timeline of manga additions."""
    try:
        filter_query = get_filter_params(
            search=search,
            read_status=read_status,
            read_statuses=read_statuses,
            exclude_read_statuses=exclude_read_statuses,
            tags=tags,
            exclude_tags=exclude_tags,
            tag_mode=tag_mode,
            content_ratings=content_ratings,
            demographics=demographics,
            statuses=statuses,
            original_languages=original_languages,
            authors=authors,
            artists=artists,
            rating_min=rating_min,
            rating_max=rating_max,
            year_start=year_start,
            year_end=year_end,
        )
        start_dt = parse_iso_date(added_start_date)
        end_dt = parse_iso_date(added_end_date, end_of_day=True)
        return await analytics_service.get_manga_added_timeline(filter_query, timeline_group_by, start_dt, end_dt)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/review-timeline")
async def get_review_timeline(
    search: Optional[str] = Query(None),
    read_status: Optional[str] = Query(None),
    read_statuses: Optional[List[str]] = Query(None),
    exclude_read_statuses: Optional[List[str]] = Query(None),
    tags: Optional[List[str]] = Query(None),
    exclude_tags: Optional[List[str]] = Query(None),
    tag_mode: str = Query("all"),
    content_ratings: Optional[List[str]] = Query(None),
    demographics: Optional[List[str]] = Query(None),
    statuses: Optional[List[str]] = Query(None),
    original_languages: Optional[List[str]] = Query(None),
    authors: Optional[List[str]] = Query(None),
    artists: Optional[List[str]] = Query(None),
    rating_min: Optional[float] = Query(None),
    rating_max: Optional[float] = Query(None),
    year_start: Optional[str] = Query(None),
    year_end: Optional[str] = Query(None),
    timeline_group_by: str = Query("month"),
    review_start_date: Optional[str] = Query(None),
    review_end_date: Optional[str] = Query(None),
):
    """Get timeline of review creation."""
    try:
        filter_query = get_filter_params(
            search=search,
            read_status=read_status,
            read_statuses=read_statuses,
            exclude_read_statuses=exclude_read_statuses,
            tags=tags,
            exclude_tags=exclude_tags,
            tag_mode=tag_mode,
            content_ratings=content_ratings,
            demographics=demographics,
            statuses=statuses,
            original_languages=original_languages,
            authors=authors,
            artists=artists,
            rating_min=rating_min,
            rating_max=rating_max,
            year_start=year_start,
            year_end=year_end,
        )
        from backend.database.connection import get_db

        manga_ids = [str(mid) for mid in await get_db().mangas.find(filter_query).distinct("_id")]
        start_dt = parse_iso_date(review_start_date)
        end_dt = parse_iso_date(review_end_date, end_of_day=True)
        return await analytics_service.get_review_activity_timeline(manga_ids, timeline_group_by, start_dt, end_dt)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/completed-timeline")
async def get_completed_timeline(
    search: Optional[str] = Query(None),
    read_status: Optional[str] = Query(None),
    read_statuses: Optional[List[str]] = Query(None),
    exclude_read_statuses: Optional[List[str]] = Query(None),
    tags: Optional[List[str]] = Query(None),
    exclude_tags: Optional[List[str]] = Query(None),
    tag_mode: str = Query("all"),
    content_ratings: Optional[List[str]] = Query(None),
    demographics: Optional[List[str]] = Query(None),
    statuses: Optional[List[str]] = Query(None),
    original_languages: Optional[List[str]] = Query(None),
    authors: Optional[List[str]] = Query(None),
    artists: Optional[List[str]] = Query(None),
    rating_min: Optional[float] = Query(None),
    rating_max: Optional[float] = Query(None),
    year_start: Optional[str] = Query(None),
    year_end: Optional[str] = Query(None),
    timeline_group_by: str = Query("month"),
    completed_start_date: Optional[str] = Query(None),
    completed_end_date: Optional[str] = Query(None),
):
    """Get timeline of manga completions."""
    try:
        filter_query = get_filter_params(
            search=search,
            read_status=read_status,
            read_statuses=read_statuses,
            exclude_read_statuses=exclude_read_statuses,
            tags=tags,
            exclude_tags=exclude_tags,
            tag_mode=tag_mode,
            content_ratings=content_ratings,
            demographics=demographics,
            statuses=statuses,
            original_languages=original_languages,
            authors=authors,
            artists=artists,
            rating_min=rating_min,
            rating_max=rating_max,
            year_start=year_start,
            year_end=year_end,
        )
        from backend.database.connection import get_db

        manga_ids = [str(mid) for mid in await get_db().mangas.find(filter_query).distinct("_id")]
        start_dt = parse_iso_date(completed_start_date)
        end_dt = parse_iso_date(completed_end_date, end_of_day=True)
        return await analytics_service.get_manga_completed_timeline(manga_ids, timeline_group_by, start_dt, end_dt)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tags-details")
async def get_tags_details(
    search: Optional[str] = Query(None),
    read_status: Optional[str] = Query(None),
    read_statuses: Optional[List[str]] = Query(None),
    exclude_read_statuses: Optional[List[str]] = Query(None),
    tags: Optional[List[str]] = Query(None),
    exclude_tags: Optional[List[str]] = Query(None),
    tag_mode: str = Query("all"),
    content_ratings: Optional[List[str]] = Query(None),
    demographics: Optional[List[str]] = Query(None),
    statuses: Optional[List[str]] = Query(None),
    original_languages: Optional[List[str]] = Query(None),
    authors: Optional[List[str]] = Query(None),
    artists: Optional[List[str]] = Query(None),
    rating_min: Optional[float] = Query(None),
    rating_max: Optional[float] = Query(None),
    year_start: Optional[str] = Query(None),
    year_end: Optional[str] = Query(None),
):
    """Get detailed breakdowns (demographic, status, content rating, and scores) for all tags in the filtered pool."""
    try:
        filter_query = get_filter_params(
            search=search,
            read_status=read_status,
            read_statuses=read_statuses,
            exclude_read_statuses=exclude_read_statuses,
            tags=tags,
            exclude_tags=exclude_tags,
            tag_mode=tag_mode,
            content_ratings=content_ratings,
            demographics=demographics,
            statuses=statuses,
            original_languages=original_languages,
            authors=authors,
            artists=artists,
            rating_min=rating_min,
            rating_max=rating_max,
            year_start=year_start,
            year_end=year_end,
        )
        return await analytics_service.get_tags_details(filter_query)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/creators-details")
async def get_creators_details(
    search: Optional[str] = Query(None),
    read_status: Optional[str] = Query(None),
    read_statuses: Optional[List[str]] = Query(None),
    exclude_read_statuses: Optional[List[str]] = Query(None),
    tags: Optional[List[str]] = Query(None),
    exclude_tags: Optional[List[str]] = Query(None),
    tag_mode: str = Query("all"),
    content_ratings: Optional[List[str]] = Query(None),
    demographics: Optional[List[str]] = Query(None),
    statuses: Optional[List[str]] = Query(None),
    original_languages: Optional[List[str]] = Query(None),
    authors: Optional[List[str]] = Query(None),
    artists: Optional[List[str]] = Query(None),
    rating_min: Optional[float] = Query(None),
    rating_max: Optional[float] = Query(None),
    year_start: Optional[str] = Query(None),
    year_end: Optional[str] = Query(None),
):
    """Get detailed breakdowns (demographics, status, rating, tags) for all authors and artists in the filtered pool."""
    try:
        filter_query = get_filter_params(
            search=search,
            read_status=read_status,
            read_statuses=read_statuses,
            exclude_read_statuses=exclude_read_statuses,
            tags=tags,
            exclude_tags=exclude_tags,
            tag_mode=tag_mode,
            content_ratings=content_ratings,
            demographics=demographics,
            statuses=statuses,
            original_languages=original_languages,
            authors=authors,
            artists=artists,
            rating_min=rating_min,
            rating_max=rating_max,
            year_start=year_start,
            year_end=year_end,
        )
        return await analytics_service.get_creators_details(filter_query)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/review-corpus/summary", response_model=ReviewCorpusSummaryResponse)
async def get_review_corpus_summary():
    """Get aggregated metrics and overview statistics of all reviews written by the author."""
    try:
        return await review_export_service.get_review_corpus_summary()
    except Exception as e:
        logger.error(f"Failed to calculate review corpus summary: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate review summary: {str(e)}")


@router.post("/review-corpus/export", response_model=ReviewCorpusExportResponse)
async def export_review_corpus(req: ReviewCorpusExportRequest):
    """Compile and export all reviews into a unified corpus document (Markdown, JSON, or Plain Text)

    specifically formatted with metadata and system prompt instructions for LLM style emulation.
    """
    try:
        return await review_export_service.export_corpus(req)
    except Exception as e:
        logger.error(f"Failed to export review corpus: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to export review corpus: {str(e)}")


@router.get("/review-corpus/download")
async def download_review_corpus(
    format: str = Query("markdown", description="'markdown', 'json', or 'txt'"),
    read_statuses: Optional[List[str]] = Query(None),
    rating_min: Optional[float] = Query(None),
    rating_max: Optional[float] = Query(None),
    sort_by: str = Query("created_at_desc"),
    include_synopsis: bool = Query(True),
    include_system_prompt: bool = Query(True),
    include_manga_meta: bool = Query(True),
    include_alt_titles: bool = Query(True),
):
    """Direct file download of compiled review corpus."""
    try:

        def _resolve_val(val, default):
            if hasattr(val, "default"):
                return default
            return val

        actual_format = _resolve_val(format, "markdown")
        actual_rating_min = _resolve_val(rating_min, None)
        actual_rating_max = _resolve_val(rating_max, None)
        actual_sort_by = _resolve_val(sort_by, "created_at_desc")
        actual_synopsis = _resolve_val(include_synopsis, True)
        actual_sys_prompt = _resolve_val(include_system_prompt, True)
        actual_manga_meta = _resolve_val(include_manga_meta, True)
        actual_alt_titles = _resolve_val(include_alt_titles, True)
        actual_read_statuses = _resolve_val(read_statuses, None)

        parsed_read_statuses = parse_list_param(actual_read_statuses)
        req = ReviewCorpusExportRequest(
            format=actual_format,
            read_statuses=parsed_read_statuses,
            rating_min=actual_rating_min,
            rating_max=actual_rating_max,
            sort_by=actual_sort_by,
            include_synopsis=actual_synopsis,
            include_system_prompt=actual_sys_prompt,
            include_manga_meta=actual_manga_meta,
            include_alt_titles=actual_alt_titles,
        )
        res = await review_export_service.export_corpus(req)

        media_types = {
            "json": "application/json",
            "txt": "text/plain; charset=utf-8",
            "markdown": "text/markdown; charset=utf-8",
        }
        media_type = media_types.get(res.format.lower(), "text/markdown; charset=utf-8")

        return Response(
            content=res.content,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{res.filename}"',
                "Content-Type": media_type,
            },
        )
    except Exception as e:
        logger.error(f"Failed to download review corpus: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to download review corpus: {str(e)}")


@router.get("/reviews-management", response_model=ReviewManagementResponse)
async def get_reviews_management(
    search: Optional[str] = Query(None),
    read_status: Optional[str] = Query(None),
    rating_min: Optional[float] = Query(None),
    rating_max: Optional[float] = Query(None),
    sort_by: str = Query("created_at_desc"),
):
    """List and filter all reviews across the manga library for centralized management."""
    try:

        def _resolve_val(val, default):
            if hasattr(val, "default"):
                return default
            return val

        actual_search = _resolve_val(search, None)
        actual_read_status = _resolve_val(read_status, None)
        actual_rating_min = _resolve_val(rating_min, None)
        actual_rating_max = _resolve_val(rating_max, None)
        actual_sort_by = _resolve_val(sort_by, "created_at_desc")

        return await review_export_service.get_reviews_management_list(
            search=actual_search,
            read_status=actual_read_status,
            rating_min=actual_rating_min,
            rating_max=actual_rating_max,
            sort_by=actual_sort_by,
        )
    except Exception as e:
        logger.error(f"Failed to fetch reviews management list: {e}")
        raise HTTPException(status_code=500, detail=str(e))
