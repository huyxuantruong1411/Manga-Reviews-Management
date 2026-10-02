"""
association.py - Spatial association between Frames, Balloons, and Text Regions.
"""

from typing import List, Optional, Tuple

from backend.services.vision.evaluation.metrics import calculate_iou
from backend.services.vision.types import LayoutRegion


class RegionAssociator:
    """
    Constructs the hierarchical relationship graph:
    Frame -> Balloon -> Text
    """

    def is_point_inside_box(
        self,
        px: float,
        py: float,
        box: Tuple[float, float, float, float],
    ) -> bool:
        bx1, by1, bx2, by2 = box
        return bx1 <= px <= bx2 and by1 <= py <= by2

    def associate_text(
        self,
        text_bbox: Tuple[float, float, float, float],
        frames: List[LayoutRegion],
        balloons: List[LayoutRegion],
    ) -> Tuple[Optional[str], Optional[str], float]:
        """
        Given a text bounding box, find its parent balloon and parent frame.
        Returns:
            (panel_region_id, balloon_region_id, association_confidence)

        RULE: If text is outside all detected frames, panel_region_id is None.
        Never fabricate a fake frame for outside text!
        """
        tx1, ty1, tx2, ty2 = text_bbox
        tcx = (tx1 + tx2) / 2.0
        tcy = (ty1 + ty2) / 2.0

        # 1. Match Balloon: center containment or highest IoU
        matched_balloon: Optional[LayoutRegion] = None
        for b in balloons:
            if self.is_point_inside_box(tcx, tcy, b.bbox):
                matched_balloon = b
                break

        if not matched_balloon:
            best_iou = 0.0
            for b in balloons:
                iou = calculate_iou(text_bbox, b.bbox)
                if iou > best_iou and iou > 0.1:
                    best_iou = iou
                    matched_balloon = b

        balloon_id = matched_balloon.id if matched_balloon else None

        # 2. Match Frame: center containment
        matched_frame: Optional[LayoutRegion] = None
        for f in frames:
            if self.is_point_inside_box(tcx, tcy, f.bbox):
                matched_frame = f
                break

        if not matched_frame:
            best_iou = 0.0
            for f in frames:
                iou = calculate_iou(text_bbox, f.bbox)
                if iou > best_iou and iou > 0.15:
                    best_iou = iou
                    matched_frame = f

        panel_id = matched_frame.id if matched_frame else None

        conf = 0.95 if (panel_id and balloon_id) else (0.80 if panel_id else 0.50)
        return panel_id, balloon_id, conf


region_associator = RegionAssociator()
