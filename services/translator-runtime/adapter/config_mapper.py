"""Config mapper for MangaTranslator runtime.

Maps domain effective_config and ISO language codes to the internal engine
format expected by MangaTranslator.
"""

from typing import Any, Dict

# Supported ISO 639-1 / BCP-47 language codes mapped to MangaTranslator language names
ISO_TO_ENGINE_LANGUAGES: Dict[str, str] = {
    "auto": "auto",
    "ja": "Japanese",
    "jp": "Japanese",
    "en": "English",
    "vi": "Vietnamese",
    "ko": "Korean",
    "kor": "Korean",
    "zh": "Chinese (Simplified)",
    "zh-cn": "Chinese (Simplified)",
    "zh-hans": "Chinese (Simplified)",
    "zh-tw": "Chinese (Traditional)",
    "zh-hant": "Chinese (Traditional)",
    "fr": "French",
    "es": "Spanish",
    "de": "German",
    "ru": "Russian",
    "id": "Indonesian",
    "th": "Thai",
}


def map_iso_to_engine_language(iso_code: str) -> str:
    """Translates an ISO/BCP-47 language code to MangaTranslator engine language name.

    Raises ValueError if the code is unknown or unsupported.
    """
    if not iso_code:
        return "auto"
    cleaned = iso_code.strip().lower()
    if cleaned in ISO_TO_ENGINE_LANGUAGES:
        return ISO_TO_ENGINE_LANGUAGES[cleaned]
    raise ValueError(f"Unsupported language code '{iso_code}'.")


def map_engine_to_iso_language(engine_lang: str) -> str:
    """Reverse-maps MangaTranslator engine language name to canonical ISO code."""
    cleaned = engine_lang.strip().lower()
    for iso, name in ISO_TO_ENGINE_LANGUAGES.items():
        if name.lower() == cleaned:
            return iso
    if cleaned == "auto":
        return "auto"
    raise ValueError(f"Unknown engine language name '{engine_lang}'.")


def build_engine_config(
    effective_config: Dict[str, Any],
    source_language: str = "auto",
    target_language: str = "vi",
) -> Dict[str, Any]:
    """Transforms a domain effective_config snapshot into the engine configuration dictionary.

    Enforces bound constraints and default fallbacks.
    """
    mapped_source = map_iso_to_engine_language(source_language)
    mapped_target = map_iso_to_engine_language(target_language)

    # Base configuration dictionary compatible with MangaTranslator Config dataclass
    engine_cfg: Dict[str, Any] = {
        # Detection
        "detector": effective_config.get("detector", "default"),
        "detection_size": int(effective_config.get("detection_size", 1024)),
        "box_threshold": float(effective_config.get("box_threshold", 0.6)),
        "unclip_ratio": float(effective_config.get("unclip_ratio", 2.0)),
        "use_gpu": bool(effective_config.get("use_gpu", False)),
        # OCR
        "ocr": effective_config.get("ocr", "manga_ocr"),
        "source_lang": mapped_source,
        # Translation
        "translator": effective_config.get("translator", "gemini"),
        "target_lang": mapped_target,
        "temperature": float(effective_config.get("temperature", 0.2)),
        "high_quality_prompt": bool(effective_config.get("high_quality_prompt", True)),
        # Cleaning & Inpainting
        "inpainter": effective_config.get("inpainter", "lama_manga"),
        "inpainting_size": int(effective_config.get("inpainting_size", 1024)),
        # Typography & Rendering
        "font_path": effective_config.get("font_path"),
        "font_size_min": int(effective_config.get("font_size_min", 10)),
        "font_size_max": int(effective_config.get("font_size_max", 48)),
        "line_spacing": float(effective_config.get("line_spacing", 1.1)),
        "direction": effective_config.get("direction", "auto"),
    }

    # Bounded constraints validation
    if not (512 <= engine_cfg["detection_size"] <= 4096):
        engine_cfg["detection_size"] = 1024
    if not (0.0 <= engine_cfg["temperature"] <= 1.0):
        engine_cfg["temperature"] = 0.2
    if not (512 <= engine_cfg["inpainting_size"] <= 4096):
        engine_cfg["inpainting_size"] = 1024

    return engine_cfg
