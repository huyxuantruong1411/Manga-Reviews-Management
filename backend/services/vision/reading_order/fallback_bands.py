"""
fallback_bands.py - Simple Y-band reading order estimator.
"""

from typing import List

from backend.services.vision.reading_order.base import ReadingOrderEstimator
from backend.services.vision.types import LayoutRegion, ReadingDirection


class FallbackBandsReadingOrderEstimator(ReadingOrderEstimator):
    """Simple Y-band sorting used as a secondary fallback."""

    def sort_regions(
        self,
        regions: List[LayoutRegion],
        direction: ReadingDirection = "rtl",
    ) -> List[LayoutRegion]:
        if len(regions) <= 1:
            for idx, r in enumerate(regions):
                r.reading_order = idx
            return regions

        if direction == "rtl":
            sorted_items = sorted(regions, key=lambda p: (round(p.bbox[1], 1), -p.bbox[2]))
        else:
            sorted_items = sorted(regions, key=lambda p: (round(p.bbox[1], 1), p.bbox[0]))

        for idx, r in enumerate(sorted_items):
            r.reading_order = idx

        return sorted_items


fallback_order_estimator = FallbackBandsReadingOrderEstimator()
