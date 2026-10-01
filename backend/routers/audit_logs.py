import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Path, Query

from backend.models.audit_log import AuditLogPaginationResponse, AuditLogResponse
from backend.services.audit_service import audit_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/audit-logs", tags=["audit-logs"])


def parse_list_param(param: Optional[List[str]]) -> Optional[List[str]]:
    if not param:
        return None
    res = []
    for item in param:
        if isinstance(item, str):
            res.extend([s.strip() for s in item.split(",") if s.strip()])
        else:
            res.append(item)
    return res if res else None


@router.get("", response_model=AuditLogPaginationResponse)
async def list_audit_logs(
    search: Optional[str] = Query(None, description="Search across title, notes, fields, actions, IDs"),
    entity_type: Optional[str] = Query(
        None, description="Filter by entity type (manga, review, download, sync, system)"
    ),
    entity_id: Optional[str] = Query(None, description="Filter by specific entity ID"),
    action: Optional[str] = Query(None, description="Filter by specific action"),
    actions: Optional[List[str]] = Query(None, description="Filter by multiple actions"),
    actor: Optional[str] = Query(None, description="Filter by actor (user, system, sync, ai_agent)"),
    start_date: Optional[datetime] = Query(None, description="Filter logs starting from UTC datetime"),
    end_date: Optional[datetime] = Query(None, description="Filter logs up to UTC datetime"),
    sort_order: str = Query("desc", description="Sort order: desc or asc"),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=500),
):
    """
    Query system audit logs with multi-dimensional filtering, text search, and pagination.
    """
    parsed_actions = parse_list_param(actions)
    return await audit_service.get_audit_logs(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        actions=parsed_actions,
        actor=actor,
        search=search,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=limit,
        sort_order=sort_order,
    )


@router.get("/actions", response_model=List[str])
async def get_audit_actions():
    """Retrieve all distinct action types registered in the system."""
    return await audit_service.get_distinct_actions()


@router.get("/stats")
async def get_audit_stats():
    """Retrieve summary audit metrics, activity counts, and distribution breakdowns."""
    return await audit_service.get_audit_stats()


@router.get("/{log_id}", response_model=AuditLogResponse)
async def get_audit_log_by_id(log_id: str = Path(...)):
    """Retrieve details of a specific audit log entry."""
    res = await audit_service.get_audit_log_by_id(log_id)
    if not res:
        raise HTTPException(status_code=404, detail="Audit log entry not found")
    return res
