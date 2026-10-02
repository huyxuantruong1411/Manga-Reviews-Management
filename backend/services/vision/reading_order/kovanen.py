"""
kovanen.py - Kovanen / Manga109-style recursive spatial partitioning for reading order estimation.

Strategy:
1. Try to find a horizontal separation (empty horizontal band across all regions).
   If found, recursively sort the top partition, then the bottom partition.
2. If no horizontal cut is possible, try to find a vertical separation (empty vertical line).
   If found:
     - For RTL manga: sort Right partition before Left partition.
     - For LTR manga: sort Left partition before Right partition.
3. If neither cut is possible (overlapping or staircase panels):
   Fall back to top-down with horizontal sorting tie-breaker.
"""

from typing import List, Tuple

from backend.services.vision.reading_order.base import ReadingOrderEstimator
from backend.services.vision.types import LayoutRegion, ReadingDirection


class KovanenReadingOrderEstimator(ReadingOrderEstimator):
    """
    Recursive XY-cut reading order estimator optimized for Manga layout.
    """

    def sort_regions(
        self,
        regions: List[LayoutRegion],
        direction: ReadingDirection = "rtl",
    ) -> List[LayoutRegion]:
        if len(regions) <= 1:
            for idx, r in enumerate(regions):
                r.reading_order = idx
            return regions

        sorted_list = self._recursive_partition(regions, direction)

        # Update reading_order indices
        for idx, r in enumerate(sorted_list):
            r.reading_order = idx

        return sorted_list

    def _recursive_partition(
        self,
        items: List[LayoutRegion],
        direction: ReadingDirection,
    ) -> List[LayoutRegion]:
        if len(items) <= 1:
            return items

        # 1. Check for horizontal cut
        h_split = self._find_horizontal_split(items)
        if h_split is not None:
            top_group, bottom_group = h_split
            sorted_top = self._recursive_partition(top_group, direction)
            sorted_bottom = self._recursive_partition(bottom_group, direction)
            return sorted_top + sorted_bottom

        # 2. Check for vertical cut
        v_split = self._find_vertical_split(items)
        if v_split is not None:
            left_group, right_group = v_split
            sorted_left = self._recursive_partition(left_group, direction)
            sorted_right = self._recursive_partition(right_group, direction)

            if direction == "rtl":
                # Right to Left: Right group comes first!
                return sorted_right + sorted_left
            else:
                # Left to Right: Left group comes first
                return sorted_left + sorted_right

        # 3. Fallback: tie-breaker sorting
        return self._fallback_sort(items, direction)

    def _find_horizontal_split(self, items: List[LayoutRegion]) -> Tuple[List[LayoutRegion], List[LayoutRegion]] | None:
        """Find a horizontal boundary dividing items into top and bottom non-empty sets without overlapping any item."""
        # Sort by top y1
        sorted_by_y = sorted(items, key=lambda x: (x.bbox[1], x.bbox[3]))

        max_y2_so_far = sorted_by_y[0].bbox[3]
        for i in range(len(sorted_by_y) - 1):
            curr = sorted_by_y[i]
            max_y2_so_far = max(max_y2_so_far, curr.bbox[3])
            next_item = sorted_by_y[i + 1]

            # If the next item's top is at or below the lowest bottom of all previous items:
            # We found a valid horizontal cut!
            if next_item.bbox[1] >= max_y2_so_far - 1e-4:
                top_group = sorted_by_y[: i + 1]
                bottom_group = sorted_by_y[i + 1 :]
                return top_group, bottom_group

        return None

    def _find_vertical_split(self, items: List[LayoutRegion]) -> Tuple[List[LayoutRegion], List[LayoutRegion]] | None:
        """Find a vertical boundary dividing items into left and right non-empty sets without intersecting any item."""
        # Sort by left x1
        sorted_by_x = sorted(items, key=lambda x: (x.bbox[0], x.bbox[2]))

        max_x2_so_far = sorted_by_x[0].bbox[2]
        for i in range(len(sorted_by_x) - 1):
            curr = sorted_by_x[i]
            max_x2_so_far = max(max_x2_so_far, curr.bbox[2])
            next_item = sorted_by_x[i + 1]

            # If the next item's left edge is at or right of the rightmost edge of all previous items:
            if next_item.bbox[0] >= max_x2_so_far - 1e-4:
                left_group = sorted_by_x[: i + 1]
                right_group = sorted_by_x[i + 1 :]
                return left_group, right_group

        return None

    def _fallback_sort(self, items: List[LayoutRegion], direction: ReadingDirection) -> List[LayoutRegion]:
        """Fallback sorting with small y-band tolerance."""
        if direction == "rtl":
            # Top to bottom, right to left
            return sorted(items, key=lambda r: (round(r.bbox[1], 2), -r.bbox[2]))
        else:
            # Top to bottom, left to right
            return sorted(items, key=lambda r: (round(r.bbox[1], 2), r.bbox[0]))


kovanen_order_estimator = KovanenReadingOrderEstimator()
