from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from backend.models.pyobjectid import PyObjectId

class AuditLogBase(BaseModel):
    entity_type: str = "manga"
    entity_id: str
    action: str  # e.g., "create", "update_status", "update_rating", "sync_metadata"
    field: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    note: Optional[str] = None

class AuditLogCreate(AuditLogBase):
    pass

class AuditLogResponse(AuditLogBase):
    id: PyObjectId = Field(alias="_id")
    timestamp: datetime

    class Config:
        populate_by_name = True
