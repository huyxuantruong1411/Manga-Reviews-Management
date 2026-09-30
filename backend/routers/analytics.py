from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Any
from datetime import datetime, timedelta
from backend.services.analytics_service import analytics_service

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
    year_end: Optional[str] = Query(None)
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
        year_end=year_end
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
    completed_end_date: Optional[str] = Query(None)
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
            year_end=year_end
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
            completed_end=completed_end
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
    year_end: Optional[str] = Query(None)
):
    """Get general stats overview (total counts, averages, status distributions)."""
    try:
        filter_query = get_filter_params(
            search=search, read_status=read_status, read_statuses=read_statuses, exclude_read_statuses=exclude_read_statuses,
            tags=tags, exclude_tags=exclude_tags, tag_mode=tag_mode,
            content_ratings=content_ratings, demographics=demographics, statuses=statuses, original_languages=original_languages,
            authors=authors, artists=artists, rating_min=rating_min, rating_max=rating_max, year_start=year_start, year_end=year_end
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
    year_end: Optional[str] = Query(None)
):
    """Get count of manga per score rating."""
    try:
        filter_query = get_filter_params(
            search=search, read_status=read_status, read_statuses=read_statuses, exclude_read_statuses=exclude_read_statuses,
            tags=tags, exclude_tags=exclude_tags, tag_mode=tag_mode,
            content_ratings=content_ratings, demographics=demographics, statuses=statuses, original_languages=original_languages,
            authors=authors, artists=artists, rating_min=rating_min, rating_max=rating_max, year_start=year_start, year_end=year_end
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
    year_end: Optional[str] = Query(None)
):
    """Get top 10 tags by manga count."""
    try:
        filter_query = get_filter_params(
            search=search, read_status=read_status, read_statuses=read_statuses, exclude_read_statuses=exclude_read_statuses,
            tags=tags, exclude_tags=exclude_tags, tag_mode=tag_mode,
            content_ratings=content_ratings, demographics=demographics, statuses=statuses, original_languages=original_languages,
            authors=authors, artists=artists, rating_min=rating_min, rating_max=rating_max, year_start=year_start, year_end=year_end
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
    added_end_date: Optional[str] = Query(None)
):
    """Get timeline of manga additions."""
    try:
        filter_query = get_filter_params(
            search=search, read_status=read_status, read_statuses=read_statuses, exclude_read_statuses=exclude_read_statuses,
            tags=tags, exclude_tags=exclude_tags, tag_mode=tag_mode,
            content_ratings=content_ratings, demographics=demographics, statuses=statuses, original_languages=original_languages,
            authors=authors, artists=artists, rating_min=rating_min, rating_max=rating_max, year_start=year_start, year_end=year_end
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
    review_end_date: Optional[str] = Query(None)
):
    """Get timeline of review creation."""
    try:
        filter_query = get_filter_params(
            search=search, read_status=read_status, read_statuses=read_statuses, exclude_read_statuses=exclude_read_statuses,
            tags=tags, exclude_tags=exclude_tags, tag_mode=tag_mode,
            content_ratings=content_ratings, demographics=demographics, statuses=statuses, original_languages=original_languages,
            authors=authors, artists=artists, rating_min=rating_min, rating_max=rating_max, year_start=year_start, year_end=year_end
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
    completed_end_date: Optional[str] = Query(None)
):
    """Get timeline of manga completions."""
    try:
        filter_query = get_filter_params(
            search=search, read_status=read_status, read_statuses=read_statuses, exclude_read_statuses=exclude_read_statuses,
            tags=tags, exclude_tags=exclude_tags, tag_mode=tag_mode,
            content_ratings=content_ratings, demographics=demographics, statuses=statuses, original_languages=original_languages,
            authors=authors, artists=artists, rating_min=rating_min, rating_max=rating_max, year_start=year_start, year_end=year_end
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
    year_end: Optional[str] = Query(None)
):
    """Get detailed breakdowns (demographic, status, content rating, and scores) for all tags in the filtered pool."""
    try:
        filter_query = get_filter_params(
            search=search, read_status=read_status, read_statuses=read_statuses, exclude_read_statuses=exclude_read_statuses,
            tags=tags, exclude_tags=exclude_tags, tag_mode=tag_mode,
            content_ratings=content_ratings, demographics=demographics, statuses=statuses, original_languages=original_languages,
            authors=authors, artists=artists, rating_min=rating_min, rating_max=rating_max, year_start=year_start, year_end=year_end
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
    year_end: Optional[str] = Query(None)
):
    """Get detailed breakdowns (demographics, status, rating, tags) for all authors and artists in the filtered pool."""
    try:
        filter_query = get_filter_params(
            search=search, read_status=read_status, read_statuses=read_statuses, exclude_read_statuses=exclude_read_statuses,
            tags=tags, exclude_tags=exclude_tags, tag_mode=tag_mode,
            content_ratings=content_ratings, demographics=demographics, statuses=statuses, original_languages=original_languages,
            authors=authors, artists=artists, rating_min=rating_min, rating_max=rating_max, year_start=year_start, year_end=year_end
        )
        return await analytics_service.get_creators_details(filter_query)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


