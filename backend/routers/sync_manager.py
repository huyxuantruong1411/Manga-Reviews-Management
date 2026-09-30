from fastapi import APIRouter, Path, HTTPException, Query
from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from backend.services.sync_manager_service import sync_manager_service
from backend.database.connection import get_db

router = APIRouter(prefix="/api/sync", tags=["Sync Manager"])

# Request/Response schemas
class SyncOptions(BaseModel):
    sync_metadata: bool = True
    sync_trackers: bool = False
    sync_covers: bool = False
    sync_recommendations: bool = False

class SyncPoolFilters(BaseModel):
    read_statuses: List[str] = Field(default_factory=list)
    exclude_read_statuses: List[str] = Field(default_factory=list)
    publish_statuses: List[str] = Field(default_factory=list)
    content_ratings: List[str] = Field(default_factory=list)
    demographics: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    exclude_tags: List[str] = Field(default_factory=list)
    original_languages: List[str] = Field(default_factory=list)

class SyncPoolSchedule(BaseModel):
    type: str = "manual"  # manual | interval
    interval_hours: Optional[int] = None

class SyncPoolCreate(BaseModel):
    name: str
    description: Optional[str] = None
    enabled: bool = True
    filters: SyncPoolFilters
    sync_options: SyncOptions
    schedule: SyncPoolSchedule

class SingleSyncRequest(BaseModel):
    manga_id: str
    options: SyncOptions

class BatchSyncRequest(BaseModel):
    manga_ids: List[str]
    options: SyncOptions

class SystemSettingsUpdate(BaseModel):
    cover_resolution: str  # original | 512 | 256

class SyncRunCreate(BaseModel):
    name: str
    type: str  # pool | batch
    total_count: int
    sync_options: Dict[str, bool]

class SyncRunUpdate(BaseModel):
    status: str  # running | completed | failed | cancelled
    completed_count: int
    failed_count: int
    logs: List[str]
    items: List[Dict[str, Any]]

# Settings Endpoints
@router.get("/settings")
async def get_system_settings():
    """Retrieve global sync settings (e.g. cover art resolution configuration)."""
    try:
        db = get_db()
        settings_doc = await db.settings.find_one({"key": "system_settings"})
        if not settings_doc or "value" not in settings_doc:
            return {"cover_resolution": "original"}
        return settings_doc["value"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving settings: {e}")

@router.put("/settings")
async def update_system_settings(req: SystemSettingsUpdate):
    """Update global sync settings."""
    if req.cover_resolution not in ["original", "512", "256"]:
        raise HTTPException(status_code=400, detail="Invalid resolution. Must be original, 512, or 256.")
    try:
        db = get_db()
        await db.settings.update_one(
            {"key": "system_settings"},
            {"$set": {"value": {"cover_resolution": req.cover_resolution}}},
            upsert=True
        )
        return {"cover_resolution": req.cover_resolution}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating settings: {e}")

# Pool Management Endpoints
@router.get("/pools")
async def get_pools():
    """List all sync pools."""
    try:
        return await sync_manager_service.get_sync_pools()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting sync pools: {e}")

@router.post("/pools")
async def create_pool(req: SyncPoolCreate):
    """Create a new sync pool configuration."""
    try:
        return await sync_manager_service.create_sync_pool(req.dict())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating sync pool: {e}")

@router.get("/pools/{pool_id}")
async def get_pool(pool_id: str = Path(...)):
    """Retrieve a single sync pool."""
    db = get_db()
    from bson import ObjectId
    if not ObjectId.is_valid(pool_id):
        raise HTTPException(status_code=400, detail="Invalid pool ID format")
    pool = await db.sync_configs.find_one({"_id": ObjectId(pool_id)})
    if not pool:
        raise HTTPException(status_code=404, detail="Sync pool not found")
    from backend.services.manga_service import serialize_doc
    return serialize_doc(pool)

@router.put("/pools/{pool_id}")
async def update_pool(req: SyncPoolCreate, pool_id: str = Path(...)):
    """Update an existing sync pool configuration."""
    try:
        updated = await sync_manager_service.update_sync_pool(pool_id, req.dict())
        if not updated:
            raise HTTPException(status_code=404, detail="Sync pool not found")
        return updated
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating sync pool: {e}")

@router.delete("/pools/{pool_id}")
async def delete_pool(pool_id: str = Path(...)):
    """Delete a sync pool configuration."""
    try:
        success = await sync_manager_service.delete_sync_pool(pool_id)
        if not success:
            raise HTTPException(status_code=404, detail="Sync pool not found or invalid format")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting sync pool: {e}")

@router.post("/pools/{pool_id}/preview")
async def preview_pool(pool_id: str = Path(...)):
    """Preview which mangas in the library match the sync pool filters."""
    try:
        return await sync_manager_service.preview_sync_pool(pool_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error previewing sync pool: {e}")

@router.post("/pools/{pool_id}/execute")
async def execute_pool(pool_id: str = Path(...)):
    """Trigger the execution of a sync pool (queued in the background)."""
    try:
        return await sync_manager_service.execute_sync_pool(pool_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error executing sync pool: {e}")

# Single / Batch Sync Trigger Endpoints
@router.post("/single")
async def sync_single(req: SingleSyncRequest):
    """Sync a single manga synchronously."""
    try:
        result = await sync_manager_service.execute_single_sync(req.manga_id, req.options.dict())
        if result.get("status") == "failed":
            raise HTTPException(status_code=400, detail=result.get("errors", ["Sync failed"]))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error syncing manga: {e}")

@router.post("/batch")
async def sync_batch(req: BatchSyncRequest):
    """Queue a batch of mangas to sync in the background."""
    try:
        return await sync_manager_service.execute_batch_sync(req.manga_ids, req.options.dict())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error triggering batch sync: {e}")

@router.post("/abort-active")
async def abort_active_syncs():
    """Cancel all active background synchronization tasks immediately."""
    try:
        return await sync_manager_service.cancel_all_active_syncs()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error cancelling sync tasks: {e}")

# History Logs / Stats Endpoints
@router.get("/logs")
async def get_logs(limit: int = Query(50, ge=1, le=200)):
    """Retrieve the recent sync audit logs."""
    try:
        return await sync_manager_service.get_sync_history(limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving logs: {e}")

@router.get("/stats")
async def get_stats():
    """Retrieve high-level synchronization statistics."""
    try:
        return await sync_manager_service.get_sync_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving sync statistics: {e}")

@router.post("/runs")
async def create_sync_run(req: SyncRunCreate):
    """Create a new sync run log in the DB."""
    try:
        db = get_db()
        doc = {
            "name": req.name,
            "type": req.type,
            "status": "running",
            "total_count": req.total_count,
            "completed_count": 0,
            "failed_count": 0,
            "sync_options": req.sync_options,
            "started_at": datetime.utcnow(),
            "completed_at": None,
            "logs": [],
            "items": []
        }
        res = await db.sync_runs.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        return doc
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/runs/{run_id}")
async def update_sync_run(run_id: str, req: SyncRunUpdate):
    """Update logs, counts, status, and items for an active sync run."""
    try:
        db = get_db()
        from bson import ObjectId
        if not ObjectId.is_valid(run_id):
            raise HTTPException(status_code=400, detail="Invalid run ID")
        
        update_data = {
            "status": req.status,
            "completed_count": req.completed_count,
            "failed_count": req.failed_count,
            "logs": req.logs,
            "items": req.items,
            "updated_at": datetime.utcnow()
        }
        
        if req.status in ["completed", "failed", "cancelled"]:
            update_data["completed_at"] = datetime.utcnow()
            
        await db.sync_runs.update_one({"_id": ObjectId(run_id)}, {"$set": update_data})
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/runs")
async def get_sync_runs(limit: int = Query(50, ge=1, le=100)):
    """Retrieve the recent sync runs history."""
    try:
        db = get_db()
        cursor = db.sync_runs.find({}).sort("started_at", -1).limit(limit)
        runs = []
        from backend.services.manga_service import serialize_doc
        async for doc in cursor:
            runs.append(serialize_doc(doc))
        return runs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
