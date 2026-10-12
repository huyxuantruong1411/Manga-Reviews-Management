"""Authoritative engine readiness, separate from hardware/credential probes.

The bundled adapter is a protocol harness, not an inference engine. Keep the
production entry point closed until a real adapter and its model manifest are
integrated and verified. Client profile settings cannot override this boundary.
"""

import re

from fastapi import HTTPException

ENGINE_UNAVAILABLE_MESSAGE = (
    "Chưa cài engine dịch thực. Runtime hiện chỉ hỗ trợ kiểm thử mô phỏng; chưa thể tạo hoặc xuất bản bản dịch mới."
)


def engine_status() -> dict:
    return {"status": "unavailable", "execution_mode": "synthetic_only", "message": ENGINE_UNAVAILABLE_MESSAGE}


def has_verified_source(result: dict) -> bool:
    """Quarantine known harness/legacy placeholders without deleting user edits."""
    return result.get("execution_mode") != "synthetic" and bool(
        re.fullmatch(r"[0-9a-f]{64}", result.get("source_sha256", ""))
    )


def binding_output_key(binding: dict, result: dict) -> str | None:
    if not has_verified_source(result):
        return None
    if binding.get("validated_source_hash") != result.get("source_sha256"):
        return None
    # A binding pins a file. Never silently substitute the latest edited result.
    if binding.get("output_object_key"):
        return binding["output_object_key"]
    if binding.get("chosen_revision") == result.get("active_revision"):
        return result.get("output_object_key")
    return None


def require_translation_engine() -> None:
    raise HTTPException(
        status_code=503,
        detail={"code": "TRANSLATION_ENGINE_UNAVAILABLE", "message": ENGINE_UNAVAILABLE_MESSAGE},
    )
