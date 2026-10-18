"""Authoritative engine readiness, separate from hardware/credential probes.

The bundled adapter is a protocol harness, not an inference engine. Keep the
production entry point closed until a real adapter and its model manifest are
integrated and verified. Client profile settings cannot override this boundary.
"""

import os
import re
from pathlib import Path

from fastapi import HTTPException

from backend.config import settings

ENGINE_UNAVAILABLE_MESSAGE = (
    "Chưa cài engine dịch thực. Runtime hiện chỉ hỗ trợ kiểm thử mô phỏng; chưa thể tạo hoặc xuất bản bản dịch mới."
)
ENGINE_READY_MESSAGE = "Engine dịch MangaTranslator (GTX 1660 Ti CUDA + Gemini Pro) đã sẵn sàng."


def find_translator_python() -> str | None:
    """Finds the Python executable for MangaTranslator isolated execution plane."""
    candidates = [
        getattr(settings, "translator_python_path", None),
        os.environ.get("TRANSLATOR_PYTHON_PATH"),
        "d:/Projects/Manga/MangaTranslator/venv/Scripts/python.exe",
        "d:/Projects/Manga/Manga-Reviews-Management/ref/MangaTranslator/venv/Scripts/python.exe",
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return str(Path(c).resolve())
    return None


def has_translation_engine() -> bool:
    """Checks whether the isolated translator Python and required YOLO model weights exist."""
    py_exe = find_translator_python()
    if not py_exe:
        return False
    # Check for primary speech bubble detector model weight
    repo_root = Path(__file__).resolve().parent.parent.parent.parent
    model_candidates = [
        repo_root / "ref" / "MangaTranslator" / "models" / "yolo" / "comic-speech-bubble-detector-yolov8m.pt",
        Path("d:/Projects/Manga/MangaTranslator/models/yolo/comic-speech-bubble-detector-yolov8m.pt"),
    ]
    return any(p.is_file() for p in model_candidates)


def engine_status() -> dict:
    if has_translation_engine():
        return {
            "status": "ready",
            "execution_mode": "real",
            "message": ENGINE_READY_MESSAGE,
        }
    return {
        "status": "unavailable",
        "execution_mode": "synthetic_only",
        "message": ENGINE_UNAVAILABLE_MESSAGE,
    }


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
    if not has_translation_engine():
        raise HTTPException(
            status_code=503,
            detail={"code": "TRANSLATION_ENGINE_UNAVAILABLE", "message": ENGINE_UNAVAILABLE_MESSAGE},
        )
