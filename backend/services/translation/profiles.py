"""Translation Profile Management Service.

Provides immutable profile revisions, deterministic config hashing,
revision diffing, conflict detection, and secret sanitization on export.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import backend.database.connection as db_conn
from backend.models.translation import (
    TranslationProfileCreate,
    TranslationProfileInDB,
    TranslationProfileRevision,
    compute_config_hash,
)

logger = logging.getLogger("backend.translation.profiles")

# Sensitive key patterns that must be redacted when exporting profiles
SENSITIVE_EXACT_KEYS = {"api_key", "secret", "token", "password", "credential", "client_secret", "bearer_token"}
SENSITIVE_SUFFIXES = ("_key", "_secret", "_password", "_token")
EXCLUDED_SAFE_KEYS = {"max_tokens", "num_tokens", "token_limit", "total_tokens"}
SERVER_PATH_KEYS = {"local_model_path", "server_workdir", "workdir", "model_dir"}


class TranslationProfileService:
    @staticmethod
    def sanitize_config_for_export(config: Dict[str, Any]) -> Dict[str, Any]:
        """Redacts sensitive credentials and strips internal server filesystem paths."""
        sanitized = {}
        for k, v in config.items():
            lower_k = k.lower()
            if any(path_key in lower_k for path_key in SERVER_PATH_KEYS):
                continue
            if lower_k in EXCLUDED_SAFE_KEYS:
                sanitized[k] = v
                continue
            is_sensitive = (
                lower_k in SENSITIVE_EXACT_KEYS
                or any(lower_k.endswith(suffix) for suffix in SENSITIVE_SUFFIXES)
                or any(lower_k.startswith(prefix) for prefix in ("key_", "secret_", "token_"))
            )
            if is_sensitive and isinstance(v, (str, bytes)):
                sanitized[k] = "[REDACTED]"
            elif isinstance(v, dict):
                sanitized[k] = TranslationProfileService.sanitize_config_for_export(v)
            else:
                sanitized[k] = v
        return sanitized

    async def list_profiles(self) -> List[Dict[str, Any]]:
        """Lists all translation profiles."""
        db = db_conn.get_db()
        cursor = db["translation_profiles"].find({})
        profiles = await cursor.to_list(length=100)
        for p in profiles:
            p.pop("_id", None)
        return profiles

    async def get_profile(self, profile_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single profile by ID."""
        db = db_conn.get_db()
        doc = await db["translation_profiles"].find_one({"profile_id": profile_id})
        if doc:
            doc.pop("_id", None)
        return doc

    async def create_profile(self, req: TranslationProfileCreate) -> Dict[str, Any]:
        """Creates a new profile and its immutable revision 1 record."""
        db = db_conn.get_db()
        profile_id = str(uuid.uuid4())
        cfg = req.effective_config or {}
        cfg_hash = compute_config_hash(cfg)
        now = datetime.now(timezone.utc)

        # 1. Create Revision 1
        rev1 = TranslationProfileRevision(
            profile_id=profile_id,
            revision=1,
            scope=req.scope,
            effective_config=cfg,
            config_hash=cfg_hash,
            created_at=now,
        )
        await db["translation_profile_revisions"].insert_one(rev1.model_dump(by_alias=True, exclude={"id"}))

        # 2. Create Profile Document
        profile_doc = TranslationProfileInDB(
            profile_id=profile_id,
            name=req.name,
            target_language=req.target_language,
            source_language=req.source_language,
            scope=req.scope,
            effective_config=cfg,
            is_default=req.is_default,
            description=req.description,
            active_revision=1,
            config_hash=cfg_hash,
            created_at=now,
            updated_at=now,
        )
        doc_dict = profile_doc.model_dump(by_alias=True, exclude={"id"})
        await db["translation_profiles"].insert_one(doc_dict)

        doc_dict.pop("_id", None)
        return doc_dict

    async def update_profile(
        self,
        profile_id: str,
        update_data: Dict[str, Any],
        expected_revision: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Updates a profile by creating revision N+1, preventing lost updates via expected_revision."""
        db = db_conn.get_db()
        existing = await db["translation_profiles"].find_one({"profile_id": profile_id})
        if not existing:
            raise KeyError(f"Profile {profile_id} not found")

        active_rev = existing.get("active_revision", 1)
        if expected_revision is not None and expected_revision != active_rev:
            raise ValueError(f"Revision conflict: Expected revision {expected_revision} but active is {active_rev}")

        new_rev_number = active_rev + 1
        new_config = update_data.get("effective_config", existing.get("effective_config", {}))
        new_hash = compute_config_hash(new_config)
        now = datetime.now(timezone.utc)

        # 1. Insert new immutable revision
        new_rev = TranslationProfileRevision(
            profile_id=profile_id,
            revision=new_rev_number,
            scope=existing.get("scope", "local"),
            effective_config=new_config,
            config_hash=new_hash,
            created_at=now,
        )
        await db["translation_profile_revisions"].insert_one(new_rev.model_dump(by_alias=True, exclude={"id"}))

        # 2. Update active profile document
        set_fields = {
            "active_revision": new_rev_number,
            "config_hash": new_hash,
            "effective_config": new_config,
            "updated_at": now,
        }
        for k in ("name", "target_language", "source_language", "is_default", "description"):
            if k in update_data:
                set_fields[k] = update_data[k]

        await db["translation_profiles"].update_one(
            {"profile_id": profile_id},
            {"$set": set_fields},
        )

        existing.update(set_fields)
        existing.pop("_id", None)
        return existing

    async def get_revisions(self, profile_id: str) -> List[Dict[str, Any]]:
        """Returns the revision history for a profile."""
        db = db_conn.get_db()
        cursor = db["translation_profile_revisions"].find({"profile_id": profile_id}).sort("revision", 1)
        revs = await cursor.to_list(length=100)
        for r in revs:
            r.pop("_id", None)
        return revs

    async def get_revision(self, profile_id: str, revision_number: int) -> Optional[Dict[str, Any]]:
        """Returns a specific revision of a profile."""
        db = db_conn.get_db()
        doc = await db["translation_profile_revisions"].find_one(
            {"profile_id": profile_id, "revision": revision_number}
        )
        if doc:
            doc.pop("_id", None)
        return doc

    async def diff_revisions(self, profile_id: str, rev1_number: int, rev2_number: int) -> Dict[str, Any]:
        """Calculates added, removed, and modified keys between two revisions."""
        rev1 = await self.get_revision(profile_id, rev1_number)
        rev2 = await self.get_revision(profile_id, rev2_number)
        if not rev1 or not rev2:
            raise KeyError(f"One or both revisions ({rev1_number}, {rev2_number}) not found for profile {profile_id}")

        cfg1 = rev1.get("effective_config", {})
        cfg2 = rev2.get("effective_config", {})

        keys1 = set(cfg1.keys())
        keys2 = set(cfg2.keys())

        added = {k: cfg2[k] for k in keys2 - keys1}
        removed = {k: cfg1[k] for k in keys1 - keys2}
        modified = {}
        for k in keys1 & keys2:
            if cfg1[k] != cfg2[k]:
                modified[k] = {"from": cfg1[k], "to": cfg2[k]}

        return {
            "profile_id": profile_id,
            "rev1": rev1_number,
            "rev2": rev2_number,
            "added": added,
            "removed": removed,
            "modified": modified,
        }

    async def get_or_create_default_profile(self) -> Dict[str, Any]:
        """Ensures a default profile exists and returns it."""
        db = db_conn.get_db()
        existing = await db["translation_profiles"].find_one({"is_default": True})
        if existing:
            existing.pop("_id", None)
            return existing

        default_req = TranslationProfileCreate(
            name="Default Manga Studio Profile",
            target_language="vi",
            source_language="auto",
            is_default=True,
            description="Default Manga Translation Studio pipeline for Vietnamese readers.",
            effective_config={
                "detector": "default",
                "ocr": "manga_ocr",
                "translator": "gemini",
                "render_font": "default",
                "inpainter": "none",
                "direction": "auto",
                "uppercase": False,
            },
        )
        return await self.create_profile(default_req)


translation_profile_service = TranslationProfileService()
