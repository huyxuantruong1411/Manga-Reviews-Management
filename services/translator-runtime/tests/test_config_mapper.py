"""Unit tests for config mapper in translator runtime adapter."""

import os
import sys

import pytest

# Ensure translator-runtime is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from adapter.config_mapper import (
    build_engine_config,
    map_engine_to_iso_language,
    map_iso_to_engine_language,
)


def test_iso_to_engine_language_mapping():
    assert map_iso_to_engine_language("vi") == "Vietnamese"
    assert map_iso_to_engine_language("ja") == "Japanese"
    assert map_iso_to_engine_language("en") == "English"
    assert map_iso_to_engine_language("zh-CN") == "Chinese (Simplified)"
    assert map_iso_to_engine_language("zh-TW") == "Chinese (Traditional)"
    assert map_iso_to_engine_language("ko") == "Korean"
    assert map_iso_to_engine_language("auto") == "auto"


def test_unknown_language_raises_value_error():
    with pytest.raises(ValueError, match="Unsupported language code"):
        map_iso_to_engine_language("klingon_xyz")


def test_engine_to_iso_language_reverse_mapping():
    assert map_engine_to_iso_language("Vietnamese") == "vi"
    assert map_engine_to_iso_language("Japanese") in ("ja", "jp")
    assert map_engine_to_iso_language("auto") == "auto"


def test_build_engine_config_bounds_and_defaults():
    effective = {
        "detector": "custom_detector",
        "detection_size": 9999,  # Out of bounds (> 4096)
        "temperature": 1.5,  # Out of bounds (> 1.0)
        "inpainting_size": 100,  # Out of bounds (< 512)
    }
    cfg = build_engine_config(effective, source_language="ja", target_language="vi")
    assert cfg["detector"] == "custom_detector"
    assert cfg["source_lang"] == "Japanese"
    assert cfg["target_lang"] == "Vietnamese"
    # Should be clamped/fallback to bounds
    assert cfg["detection_size"] == 1024
    assert cfg["temperature"] == 0.2
    assert cfg["inpainting_size"] == 1024
