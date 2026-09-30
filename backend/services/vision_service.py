import io
import math
import logging
from typing import List, Tuple, Dict, Any, Optional
import cv2
import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

logger = logging.getLogger("vision_service")


class VisionService:
    def __init__(self):
        self._ocr_engine = None

    @property
    def ocr_engine(self) -> RapidOCR:
        if self._ocr_engine is None:
            logger.info("Initializing RapidOCR engine (PP-OCRv4 ONNX Runtime)...")
            self._ocr_engine = RapidOCR()
            logger.info("VisionService RapidOCR initialized successfully.")
        return self._ocr_engine

    def decode_image_bytes(self, image_bytes: bytes) -> Optional[np.ndarray]:
        """Decode raw image bytes to OpenCV BGR numpy array."""
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            return img
        except Exception as e:
            logger.error(f"Error decoding image bytes: {e}")
            return None

    def segment_panels(
        self, img: np.ndarray
    ) -> List[Tuple[float, float, float, float]]:
        """
        Segment comic/manga page into individual scene panels using morphological operations.
        Returns a list of normalized bounding boxes: [(norm_x1, norm_y1, norm_x2, norm_y2), ...]
        Values are floats in the range [0.0, 1.0].
        """
        if img is None:
            return [(0.0, 0.0, 1.0, 1.0)]

        height, width = img.shape[:2]
        total_area = width * height

        # 1. Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 2. Contrast adjustment and adaptive thresholding
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        thresh = cv2.adaptiveThreshold(
            blurred,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            21,
            5,
        )

        # 3. Morphological closing to seal breaks in panel outlines
        kernel_size = max(5, int(min(width, height) * 0.008))
        kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT, (kernel_size, kernel_size)
        )
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)

        # 4. Find external/ccomp contours
        contours, _ = cv2.findContours(
            closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE
        )

        raw_boxes = []
        for cnt in contours:
            # Polygon approximation using Ramer-Douglas-Peucker
            epsilon = 0.02 * cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, epsilon, True)

            x, y, w, h = cv2.boundingRect(approx)
            box_area = w * h

            # Filter out tiny noise (< 1% total area)
            if box_area < 0.01 * total_area:
                continue

            # Full page splash detection (> 95% total area)
            if box_area > 0.95 * total_area:
                continue

            # Filter unrealistic aspect ratios (e.g., razor thin lines along borders)
            aspect = w / max(1, h)
            if aspect < 0.05 or aspect > 20.0:
                continue

            raw_boxes.append((x, y, x + w, y + h))

        if not raw_boxes:
            return [(0.0, 0.0, 1.0, 1.0)]

        # 5. Merge overlapping or heavily nested fragments
        merged_boxes = self._merge_overlapping_boxes(raw_boxes)

        # 6. Normalize coordinates [0.0, 1.0]
        norm_panels = []
        for x1, y1, x2, y2 in merged_boxes:
            nx1 = max(0.0, min(1.0, x1 / width))
            ny1 = max(0.0, min(1.0, y1 / height))
            nx2 = max(0.0, min(1.0, x2 / width))
            ny2 = max(0.0, min(1.0, y2 / height))
            if (nx2 - nx1) > 0.02 and (ny2 - ny1) > 0.02:
                norm_panels.append((nx1, ny1, nx2, ny2))

        if not norm_panels:
            return [(0.0, 0.0, 1.0, 1.0)]

        # 7. Sort panels in natural reading order (top to bottom primary, left to right secondary)
        norm_panels.sort(key=lambda p: (round(p[1], 1), p[0]))
        return norm_panels

    def _merge_overlapping_boxes(
        self, boxes: List[Tuple[int, int, int, int]]
    ) -> List[Tuple[int, int, int, int]]:
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
                        if (
                            smaller_area > 0
                            and (inter_area / smaller_area) >= 0.85
                        ):
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

    def detect_text(self, img: np.ndarray) -> List[Dict[str, Any]]:
        """
        Run OCR on manga page image.
        Returns list of text detections with normalized box coordinates and text.
        """
        if img is None:
            return []

        height, width = img.shape[:2]
        ocr_result, _ = self.ocr_engine(img)

        detections = []
        if not ocr_result:
            return detections

        for item in ocr_result:
            pts = np.array(item[0])
            text = str(item[1]).strip()
            conf = float(item[2])

            if not text or conf < 0.35:
                continue

            px1 = float(np.min(pts[:, 0]))
            py1 = float(np.min(pts[:, 1]))
            px2 = float(np.max(pts[:, 0]))
            py2 = float(np.max(pts[:, 1]))

            nx1 = max(0.0, min(1.0, px1 / width))
            ny1 = max(0.0, min(1.0, py1 / height))
            nx2 = max(0.0, min(1.0, px2 / width))
            ny2 = max(0.0, min(1.0, py2 / height))

            detections.append(
                {
                    "text": text,
                    "confidence": conf,
                    "norm_box": (nx1, ny1, nx2, ny2),
                    "center": ((nx1 + nx2) / 2.0, (ny1 + ny2) / 2.0),
                }
            )

        return detections

    def associate_text_with_panels(
        self,
        panels: List[Tuple[float, float, float, float]],
        text_detections: List[Dict[str, Any]],
    ) -> List[List[Dict[str, Any]]]:
        """
        Assign each text detection to a panel using Containment Ratio:
        Containment = Area(Text ∩ Panel) / Area(Text) >= 0.5.
        Fallback to minimum Euclidean distance between centers.
        Returns a list of text lists, one per panel, sorted in natural reading order.
        """
        panel_texts: List[List[Dict[str, Any]]] = [[] for _ in panels]

        for det in text_detections:
            tx1, ty1, tx2, ty2 = det["norm_box"]
            text_area = max(1e-6, (tx2 - tx1) * (ty2 - ty1))

            best_panel_idx = -1
            best_containment = -1.0

            for p_idx, (px1, py1, px2, py2) in enumerate(panels):
                ix1 = max(tx1, px1)
                iy1 = max(ty1, py1)
                ix2 = min(tx2, px2)
                iy2 = min(ty2, py2)

                if ix2 > ix1 and iy2 > iy1:
                    inter_area = (ix2 - ix1) * (iy2 - iy1)
                    containment = inter_area / text_area
                    if containment > best_containment:
                        best_containment = containment
                        best_panel_idx = p_idx

            if best_panel_idx != -1 and best_containment >= 0.5:
                panel_texts[best_panel_idx].append(det)
            else:
                # Euclidean distance fallback
                tc_x, tc_y = det["center"]
                min_dist = float("inf")
                fallback_idx = 0
                for p_idx, (px1, py1, px2, py2) in enumerate(panels):
                    pc_x = (px1 + px2) / 2.0
                    pc_y = (py1 + py2) / 2.0
                    dist = math.hypot(tc_x - pc_x, tc_y - pc_y)
                    if dist < min_dist:
                        min_dist = dist
                        fallback_idx = p_idx
                panel_texts[fallback_idx].append(det)

        for p_idx in range(len(panel_texts)):
            panel_texts[p_idx].sort(
                key=lambda d: (
                    round(d["norm_box"][1], 2),
                    round(d["norm_box"][0], 2),
                )
            )

        return panel_texts

    def get_panel_crop_stream(
        self,
        image_bytes: bytes,
        norm_coords: Tuple[float, float, float, float],
        quality: int = 90,
    ) -> io.BytesIO:
        """
        Dynamically crop panel from original image bytes in RAM and return JPEG BytesIO stream.
        Zero disk storage needed for crops.
        """
        with Image.open(io.BytesIO(image_bytes)) as img:
            width, height = img.size
            nx1, ny1, nx2, ny2 = norm_coords

            pad_x = (nx2 - nx1) * 0.015
            pad_y = (ny2 - ny1) * 0.015

            px1 = int(max(0, (nx1 - pad_x) * width))
            py1 = int(max(0, (ny1 - pad_y) * height))
            px2 = int(min(width, (nx2 + pad_x) * width))
            py2 = int(min(height, (ny2 + pad_y) * height))

            if px2 <= px1 or py2 <= py1:
                cropped = img
            else:
                cropped = img.crop((px1, py1, px2, py2))

            if cropped.mode in ("RGBA", "P"):
                cropped = cropped.convert("RGB")

            buffer = io.BytesIO()
            cropped.save(buffer, format="JPEG", quality=quality, optimize=True)
            buffer.seek(0)
            return buffer


vision_service = VisionService()
