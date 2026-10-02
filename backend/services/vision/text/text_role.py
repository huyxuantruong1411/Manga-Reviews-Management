"""
text_role.py - Classifies text regions into semantic dialogue, narration, sfx, sign, title, or credits.
"""

from typing import Tuple

from backend.services.vision.types import PageType, TextRole


class TextRoleClassifier:
    """
    Infers the functional role of a text region based on layout, container, and page context.
    """

    def classify_role(
        self,
        text: str,
        bbox: Tuple[float, float, float, float],
        has_balloon: bool,
        has_frame: bool,
        page_type: PageType = "story",
    ) -> TextRole:
        # 1. Cover page special roles
        if page_type == "cover":
            if bbox[1] < 0.25:  # Top section of cover
                return "title"
            return "credits"

        # 2. Inside a speech balloon -> dialogue
        if has_balloon:
            return "dialogue"

        # 3. Inside a frame without a speech balloon
        if has_frame:
            # Short expressive words like "DOKI", "BAM", "AHH" without bubbles are sound effects
            w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
            if len(text.split()) <= 2 and (w > 0.25 or h > 0.25 or text.isupper()):
                return "sfx"
            # Otherwise default to narration inside panel
            return "narration"

        # 4. Outside all frames and balloons
        if text.isupper() and len(text.split()) <= 2:
            return "sfx"

        return "sign"


text_role_classifier = TextRoleClassifier()
