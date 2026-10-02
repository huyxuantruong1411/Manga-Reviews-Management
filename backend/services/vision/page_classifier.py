"""
page_classifier.py - Classifies page type and determines indexing gates.
"""

from typing import Tuple

import numpy as np

from backend.services.vision.types import PageAnalysisContext, PageType


class PageClassifier:
    """
    Classifies a manga page to determine its structural role and search/vocabulary indexing policy.
    Uses deterministic visual and position heuristics.
    """

    def is_blank_page(self, img: np.ndarray, std_thresh: float = 8.0) -> bool:
        """Return True if image is essentially blank (solid color / uniform noise)."""
        if img is None or img.size == 0:
            return True
        gray = img if len(img.shape) == 2 else cv2_gray(img)
        return float(np.std(gray)) < std_thresh

    def classify_page(
        self,
        img: np.ndarray,
        context: PageAnalysisContext,
        frame_count: int = 0,
        text_count: int = 0,
    ) -> Tuple[PageType, bool, bool]:
        """
        Classifies the page and returns:
        (page_type, index_for_search, index_for_vocabulary)
        """
        # 1. Blank page gate
        if self.is_blank_page(img):
            return "blank", False, False

        # 2. Cover page heuristic: First page of a chapter, especially when there are no standard frames
        # or when designated by page number and high visual/art ratio
        if context.page_number == 1:
            # Page 1 in manga is typically cover / title page
            # Cover text should NOT enter vocabulary to prevent proper names/titles from corrupting word lists
            return "cover", True, False

        # 3. Credits / afterword heuristic (e.g., last page with low panel count and specific layout)
        # For general pages:
        if frame_count == 0 and text_count > 10:
            return "editorial", True, False

        # Default story page
        return "story", True, True


def cv2_gray(img: np.ndarray) -> np.ndarray:
    """Convert BGR to grayscale without importing full cv2 module at top level if not needed."""
    import cv2

    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


page_classifier = PageClassifier()
