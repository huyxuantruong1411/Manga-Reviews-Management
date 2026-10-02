"""
base.py - Abstract base and protocol for Manga Layout Analyzers.
"""

from typing import List, Protocol

import numpy as np

from backend.services.vision.types import LayoutRegion, PageAnalysisContext


class LayoutAnalyzer(Protocol):
    """Protocol for manga layout segmentation engines."""

    def analyze_layout(
        self,
        img: np.ndarray,
        context: PageAnalysisContext,
    ) -> List[LayoutRegion]:
        """
        Analyze page layout to extract frames, balloons, and text regions.
        All coordinates must be returned as normalized [0.0, 1.0] bounding boxes.
        """
        ...
