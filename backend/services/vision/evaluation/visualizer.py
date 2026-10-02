"""
visualizer.py - Generates diagnostic overlays and report visualizations for V3.
"""

import base64

import cv2
import numpy as np

from backend.services.vision.types import PageAnalysis


def render_page_analysis_overlay(
    img: np.ndarray,
    analysis: PageAnalysis,
    show_frames: bool = True,
    show_balloons: bool = True,
    show_texts: bool = True,
) -> np.ndarray:
    """
    Render visual bounding boxes, reading order numbers, and role labels onto a copy of the page image.
    """
    overlay = img.copy()
    height, width = overlay.shape[:2]

    # 1. Frames (Blue / Navy with Order badges)
    if show_frames:
        for frame in analysis.frames:
            x1 = int(frame.bbox[0] * width)
            y1 = int(frame.bbox[1] * height)
            x2 = int(frame.bbox[2] * width)
            y2 = int(frame.bbox[3] * height)

            cv2.rectangle(overlay, (x1, y1), (x2, y2), (255, 120, 0), 3)

            # Badge for reading order
            badge_text = f"P{frame.reading_order}"
            cv2.putText(
                overlay,
                badge_text,
                (x1 + 6, y1 + 24),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 255),
                3,
                cv2.LINE_AA,
            )
            cv2.putText(
                overlay,
                badge_text,
                (x1 + 6, y1 + 24),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (200, 50, 0),
                2,
                cv2.LINE_AA,
            )

    # 2. Balloons (Green boxes)
    if show_balloons:
        for balloon in analysis.balloons:
            x1 = int(balloon.bbox[0] * width)
            y1 = int(balloon.bbox[1] * height)
            x2 = int(balloon.bbox[2] * width)
            y2 = int(balloon.bbox[3] * height)

            cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 200, 50), 2)

    # 3. Texts (Orange / Coral boxes + role tag)
    if show_texts:
        for text in analysis.texts:
            x1 = int(text.bbox[0] * width)
            y1 = int(text.bbox[1] * height)
            x2 = int(text.bbox[2] * width)
            y2 = int(text.bbox[3] * height)

            # Color code by role: dialogue (Orange), narration (Purple), sfx (Red), sign (Teal)
            color = (0, 140, 255)
            if text.text_role == "narration":
                color = (200, 0, 200)
            elif text.text_role == "sfx":
                color = (0, 0, 255)
            elif text.text_role == "sign":
                color = (200, 200, 0)

            cv2.rectangle(overlay, (x1, y1), (x2, y2), color, 2)

            label = f"{text.text_role} ({text.confidence:.2f})"
            cv2.putText(
                overlay,
                label,
                (x1, max(14, y1 - 4)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                color,
                1,
                cv2.LINE_AA,
            )

    return overlay


def image_to_base64_jpeg(img: np.ndarray, quality: int = 80) -> str:
    """Encode OpenCV BGR image as base64 JPEG string."""
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
    success, buffer = cv2.imencode(".jpg", img, encode_param)
    if not success:
        return ""
    return base64.b64encode(buffer).decode("utf-8")
