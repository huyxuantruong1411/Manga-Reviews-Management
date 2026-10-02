"""
model_registry.py - Singleton model registry for Manga Layout Analyzers.
"""

import os
from typing import Dict

from backend.services.vision.layout.base import LayoutAnalyzer
from backend.services.vision.layout.opencv_fallback import OpenCVFallbackLayoutAnalyzer
from backend.services.vision.layout.semantic_layout import SemanticLayoutAnalyzer


class LayoutModelRegistry:
    """Registry managing available layout analyzers and runtime selection."""

    def __init__(self):
        self._instances: Dict[str, LayoutAnalyzer] = {}

    def get_analyzer(self, backend_name: str = "semantic") -> LayoutAnalyzer:
        backend_name = backend_name.lower().strip()
        if backend_name not in self._instances:
            if backend_name in ("opencv", "fallback", "v2"):
                self._instances[backend_name] = OpenCVFallbackLayoutAnalyzer()
            else:
                model_path = os.getenv("VISION_LAYOUT_MODEL_PATH")
                self._instances[backend_name] = SemanticLayoutAnalyzer(model_path=model_path)

        return self._instances[backend_name]


layout_registry = LayoutModelRegistry()
