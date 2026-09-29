from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from backend.models.pyobjectid import PyObjectId

class AuditLogBase(BaseModel):
    entity_type: str = "manga"  # manga, review, system, download, sync, tag
    entity_id: str
    entity_title: Optional[str] = None
    action: str  # e.g., "create", "update_status", "update_rating", "create_review", "update_review", "delete_review"
    actor: Optional[str] = "user"  # user, system, sync, ai_agent
    field: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    note: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

class AuditLogCreate(AuditLogBase):
    pass

class AuditLogResponse(AuditLogBase):
    id: PyObjectId = Field(alias="_id")
    timestamp: datetime

    class Config:
        populate_by_name = True

class AuditLogPaginationResponse(BaseModel):
    total: int
    items: List[AuditLogResponse]
    skip: int
    limit: int

