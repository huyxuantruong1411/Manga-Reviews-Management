"""
base.py - Base protocol for Reading Order Estimators.
"""

from typing import List, Protocol

from backend.services.vision.types import LayoutRegion, ReadingDirection


class ReadingOrderEstimator(Protocol):
    def sort_regions(
        self,
        regions: List[LayoutRegion],
        direction: ReadingDirection = "rtl",
    ) -> List[LayoutRegion]:
        """
        Sort regions according to specified reading direction (RTL or LTR).
        Assigns the 0-indexed `reading_order` attribute to each region.
        """
        ...
