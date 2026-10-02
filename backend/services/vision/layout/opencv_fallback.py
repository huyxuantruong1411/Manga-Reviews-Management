"""
opencv_fallback.py - OpenCV contour-based panel segmentation preserved as fallback layout analyzer.
"""

from typing import List, Tuple
from uuid import uuid4

import cv2
import numpy as np

from backend.services.vision.layout.base import LayoutAnalyzer
from backend.services.vision.types import LayoutRegion, PageAnalysisContext


class OpenCVFallbackLayoutAnalyzer(LayoutAnalyzer):
    """
    OpenCV contour-based segmentation preserved as fallback.
    Detects rectangular frame outlines using morphological closing and hierarchy filtering.
    """

    def __init__(self):
        self.model_name = "opencv-contour-fallback"
        self.model_version = "2.0"

    def analyze_layout(
        self,
        img: np.ndarray,
        context: PageAnalysisContext,
    ) -> List[LayoutRegion]:
        if img is None or img.size == 0:
            return [
                LayoutRegion(
                    id=str(uuid4()),
                    kind="frame",
                    bbox=(0.0, 0.0, 1.0, 1.0),
                    confidence=0.5,
                    model_name=self.model_name,
                    model_version=self.model_version,
                )
            ]

        height, width = img.shape[:2]
        total_area = width * height

        # 1. Grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img

        # 2. Adaptive threshold
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        thresh = cv2.adaptiveThreshold(
            blurred,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            21,
            5,
        )

        # 3. Morphological closing to seal breaks
        kernel_size = max(5, int(min(width, height) * 0.008))
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)

        # 4. Find contours
        contours, _ = cv2.findContours(closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)

        raw_boxes: List[Tuple[int, int, int, int]] = []
        for cnt in contours:
            epsilon = 0.02 * cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, epsilon, True)
            x, y, w, h = cv2.boundingRect(approx)
            box_area = w * h

            # Filter tiny noise (< 1% total area) or full page splash (> 95% total area)
            if box_area < 0.01 * total_area or box_area > 0.95 * total_area:
                continue

            aspect = w / max(1, h)
            if aspect < 0.05 or aspect > 20.0:
                continue

            raw_boxes.append((x, y, x + w, y + h))

        if not raw_boxes:
            return [
                LayoutRegion(
                    id=str(uuid4()),
                    kind="frame",
                    bbox=(0.0, 0.0, 1.0, 1.0),
                    confidence=0.5,
                    model_name=self.model_name,
                    model_version=self.model_version,
                )
            ]

        merged_boxes = self._merge_overlapping_boxes(raw_boxes)

        regions: List[LayoutRegion] = []
        for x1, y1, x2, y2 in merged_boxes:
            nx1 = max(0.0, min(1.0, x1 / width))
            ny1 = max(0.0, min(1.0, y1 / height))
            nx2 = max(0.0, min(1.0, x2 / width))
            ny2 = max(0.0, min(1.0, y2 / height))

            if (nx2 - nx1) > 0.02 and (ny2 - ny1) > 0.02:
                regions.append(
                    LayoutRegion(
                        id=str(uuid4()),
                        kind="frame",
                        bbox=(nx1, ny1, nx2, ny2),
                        confidence=0.75,
                        model_name=self.model_name,
                        model_version=self.model_version,
                    )
                )

        if not regions:
            regions.append(
                LayoutRegion(
                    id=str(uuid4()),
                    kind="frame",
                    bbox=(0.0, 0.0, 1.0, 1.0),
                    confidence=0.5,
                    model_name=self.model_name,
                    model_version=self.model_version,
                )
            )

        return regions

    def _merge_overlapping_boxes(self, boxes: List[Tuple[int, int, int, int]]) -> List[Tuple[int, int, int, int]]:
        """Merge bounding boxes where intersection over smaller box exceeds 0.85."""
        if not boxes:
            return []

        merged = list(boxes)
        changed = True

        while changed:
            changed = False
            out = []
            used = [False] * len(merged)

            for i in range(len(merged)):
                if used[i]:
                    continue
                x1_a, y1_a, x2_a, y2_a = merged[i]
                area_a = (x2_a - x1_a) * (y2_a - y1_a)

                for j in range(i + 1, len(merged)):
                    if used[j]:
                        continue
                    x1_b, y1_b, x2_b, y2_b = merged[j]
                    area_b = (x2_b - x1_b) * (y2_b - y1_b)

                    ix1 = max(x1_a, x1_b)
                    iy1 = max(y1_a, y1_b)
                    ix2 = min(x2_a, x2_b)
                    iy2 = min(y2_a, y2_b)

                    if ix2 > ix1 and iy2 > iy1:
                        inter_area = (ix2 - ix1) * (iy2 - iy1)
                        smaller_area = min(area_a, area_b)
                        if smaller_area > 0 and (inter_area / smaller_area) >= 0.85:
                            x1_a = min(x1_a, x1_b)
                            y1_a = min(y1_a, y1_b)
                            x2_a = max(x2_a, x2_b)
                            y2_a = max(y2_a, y2_b)
                            area_a = (x2_a - x1_a) * (y2_a - y1_a)
                            used[j] = True
                            changed = True

                out.append((x1_a, y1_a, x2_a, y2_a))

            merged = out

        return merged
