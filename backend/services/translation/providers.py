"""Translation Provider Registry and Capability Probe Service.

Registers supported upstream translation backends (Gemini, OpenAI-compatible, Offline),
performs non-destructive credential capability checks, and ensures zero secret leakage.
"""

import logging
import os
from typing import Any, Dict, List, Optional

import backend.database.connection as db_conn
from backend.config import settings
from backend.models.translation import TranslationProviderInDB

logger = logging.getLogger("backend.translation.providers")

DEFAULT_PROVIDERS = [
    {
        "provider_id": "gemini-default",
        "name": "Google Gemini API",
        "kind": "gemini",
        "model_id": "gemini-2.5-flash",
        "is_active": True,
        "capabilities": {
            "supported_models": [
                "gemini-2.5-flash",
                "gemini-2.5-pro",
                "gemini-1.5-flash",
                "gemini-1.5-pro",
            ],
            "context_aware": True,
            "rpm_limit": 60,
        },
    },
    {
        "provider_id": "openai-compatible",
        "name": "OpenAI / Local LLM Endpoint",
        "kind": "openai_compatible",
        "model_id": "gpt-4o-mini",
        "is_active": True,
        "endpoint_url": None,
        "capabilities": {
            "supported_models": ["gpt-4o-mini", "gpt-4o", "custom"],
            "custom_endpoint": True,
        },
    },
    {
        "provider_id": "offline-stub",
        "name": "Offline / Rule-based Stub",
        "kind": "offline_stub",
        "model_id": "rule-v1",
        "is_active": True,
        "capabilities": {
            "offline": True,
            "cost": 0,
        },
    },
]


class TranslationProviderService:
    async def init_default_providers(self) -> None:
        """Seed default providers if none exist."""
        db = db_conn.get_db()
        count = await db["translation_providers"].count_documents({})
        if count == 0:
            for p in DEFAULT_PROVIDERS:
                prov = TranslationProviderInDB(**p)
                await db["translation_providers"].insert_one(prov.model_dump(by_alias=True, exclude={"id"}))

    async def list_providers(self) -> List[Dict[str, Any]]:
        """Lists registered providers merged with dynamic live configuration status."""
        db = db_conn.get_db()
        cursor = db["translation_providers"].find({})
        providers = await cursor.to_list(length=50)
        if not providers:
            await self.init_default_providers()
            cursor = db["translation_providers"].find({})
            providers = await cursor.to_list(length=50)

        results = []
        for p in providers:
            p.pop("_id", None)
            # Add safe capability status (without revealing secrets)
            p["capability_probe"] = self.probe_provider_credentials(p.get("kind"))
            results.append(p)
        return results

    def probe_provider_credentials(self, kind: Optional[str]) -> Dict[str, Any]:
        """Checks configuration without invoking paid endpoints or leaking secrets."""
        if kind == "gemini":
            has_key = bool(
                getattr(settings, "gemini_api_key", None)
                or os.environ.get("GEMINI_API_KEY")
                or os.environ.get("GOOGLE_API_KEY")
            )
            return {
                "configured": has_key,
                "status": "ready" if has_key else "missing_api_key",
                "message": "Gemini API key is configured" if has_key else "GEMINI_API_KEY environment variable not set",
            }
        elif kind == "openai_compatible":
            has_key = bool(os.environ.get("OPENAI_API_KEY"))
            return {
                "configured": has_key,
                "status": "ready" if has_key else "unconfigured",
                "message": "OpenAI credentials detected" if has_key else "No OPENAI_API_KEY detected (optional)",
            }
        elif kind == "offline_stub":
            return {
                "configured": True,
                "status": "ready",
                "message": "Offline stub always available for testing",
            }
        return {
            "configured": False,
            "status": "unknown",
            "message": "Unknown provider kind",
        }


translation_provider_service = TranslationProviderService()
