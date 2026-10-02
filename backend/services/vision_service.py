import io
import logging
import math
from typing import Any, Dict, List, Optional, Tuple

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

    def segment_panels(self, img: np.ndarray) -> List[Tuple[float, float, float, float]]:
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
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)

        # 4. Find external/ccomp contours
        contours, _ = cv2.findContours(closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)

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

    def sort_elements_by_reading_order(
        self,
        elements: List[Any],
        reading_direction: str = "rtl",
    ) -> List[Any]:
        """
        Sort boxes/elements according to comic/manga reading direction.
        - rtl: Right-to-Left, Top-to-Bottom (Japanese Manga standard)
        - ltr: Left-to-Right, Top-to-Bottom (Western Comics / Webtoons)
        Groups elements into horizontal bands (rows) and sorts within each row.
        """
        if not elements:
            return []

        is_rtl = (reading_direction or "rtl").lower() == "rtl"

        def _extract_box(item):
            if isinstance(item, dict):
                if "bbox" in item:
                    return item["bbox"]
                if "norm_box" in item:
                    return item["norm_box"]
                if "coords" in item:
                    return item["coords"]
            if isinstance(item, (list, tuple)) and len(item) >= 4:
                return item[:4]
            return (0.0, 0.0, 0.0, 0.0)

        enriched = []
        for idx, item in enumerate(elements):
            x1, y1, x2, y2 = _extract_box(item)
            cx = (x1 + x2) / 2.0
            cy = (y1 + y2) / 2.0
            h = max(0.005, y2 - y1)
            w = max(0.005, x2 - x1)
            enriched.append(
                {
                    "orig": item,
                    "box": (x1, y1, x2, y2),
                    "cx": cx,
                    "cy": cy,
                    "h": h,
                    "w": w,
                    "y1": y1,
                    "y2": y2,
                    "x1": x1,
                    "x2": x2,
                    "idx": idx,
                }
            )

        # Sort initially by y1
        enriched.sort(key=lambda e: (e["y1"], e["cy"]))

        # Group into reading bands (rows)
        bands: List[List[Dict[str, Any]]] = []
        for item in enriched:
            placed = False
            for band in bands:
                band_y1 = min(b["y1"] for b in band)
                band_y2 = max(b["y2"] for b in band)
                band_cy = (band_y1 + band_y2) / 2.0

                inter_y = max(0.0, min(item["y2"], band_y2) - max(item["y1"], band_y1))
                min_h = min(item["h"], band_y2 - band_y1)

                # Vertical overlap >= 25% or centers Y very close (< 0.05)
                if (min_h > 0 and (inter_y / min_h) >= 0.25) or abs(item["cy"] - band_cy) < 0.05:
                    band.append(item)
                    placed = True
                    break
            if not placed:
                bands.append([item])

        # Sort each band based on reading direction
        result = []
        for band in bands:
            if is_rtl:
                # Right to Left: larger x (rightmost) comes first
                band.sort(key=lambda e: -e["cx"])
            else:
                # Left to Right: smaller x (leftmost) comes first
                band.sort(key=lambda e: e["cx"])
            for e in band:
                result.append(e["orig"])

        return result

    def cluster_text_into_bubbles(
        self,
        detections: List[Dict[str, Any]],
        reading_direction: str = "rtl",
        pad_ratio: float = 0.015,
    ) -> List[Dict[str, Any]]:
        """
        Cluster adjacent OCR text lines into speech bubbles (MangaTranslator architecture).
        Returns a list of speech bubbles:
        {
            "bbox": (x1, y1, x2, y2),
            "detections": [...],
            "center": (cx, cy)
        }
        sorted in natural comic reading order.
        """
        if not detections:
            return []

        n = len(detections)
        parent = list(range(n))

        def find(i):
            if parent[i] == i:
                return i
            parent[i] = find(parent[i])
            return parent[i]

        def union(i, j):
            root_i = find(i)
            root_j = find(j)
            if root_i != root_j:
                parent[root_i] = root_j

        for i in range(n):
            box_a = detections[i]["norm_box"]
            ha = max(0.005, box_a[3] - box_a[1])
            wa = max(0.005, box_a[2] - box_a[0])
            cxa = (box_a[0] + box_a[2]) / 2.0

            for j in range(i + 1, n):
                box_b = detections[j]["norm_box"]
                hb = max(0.005, box_b[3] - box_b[1])
                wb = max(0.005, box_b[2] - box_b[0])
                cxb = (box_b[0] + box_b[2]) / 2.0

                # Vertical distance between lines
                dist_y = max(0.0, max(box_a[1], box_b[1]) - min(box_a[3], box_b[3]))
                # Vertical intersection
                inter_y = min(box_a[3], box_b[3]) - max(box_a[1], box_b[1])
                # Horizontal intersection
                inter_x = min(box_a[2], box_b[2]) - max(box_a[0], box_b[0])

                # Heavy overlap check
                inter_area = max(0.0, inter_x) * max(0.0, inter_y)
                smaller_box_area = max(1e-6, min(wa * ha, wb * hb))
                if inter_area > 0 and (inter_area / smaller_box_area) > 0.4:
                    union(i, j)
                    continue

                # If they overlap vertically significantly but are horizontally separated columns,
                # they belong to separate speech bubbles and MUST NOT be merged!
                if inter_y > 0.3 * min(ha, hb) and inter_x <= 0:
                    continue

                # Proximity rule: consecutive lines in speech bubble
                close_vertical = dist_y <= (1.6 * min(ha, hb) + 0.02)
                min_w = min(wa, wb)
                max_w = max(wa, wb)
                # Must have positive horizontal overlap or very close centers relative to width
                has_x_alignment = (inter_x > 0 and (inter_x / min_w) >= 0.20) or (abs(cxa - cxb) <= 0.35 * max_w)

                if close_vertical and has_x_alignment:
                    union(i, j)

        clusters: Dict[int, List[Dict[str, Any]]] = {}
        for i in range(n):
            root = find(i)
            if root not in clusters:
                clusters[root] = []
            clusters[root].append(detections[i])

        bubble_list = []
        for _root, group in clusters.items():
            group.sort(key=lambda d: (round(d["norm_box"][1], 2), round(d["norm_box"][0], 2)))

            min_x = min(d["norm_box"][0] for d in group)
            min_y = min(d["norm_box"][1] for d in group)
            max_x = max(d["norm_box"][2] for d in group)
            max_y = max(d["norm_box"][3] for d in group)

            w = max_x - min_x
            h = max_y - min_y
            px = max(pad_ratio, w * 0.08)
            py = max(pad_ratio, h * 0.08)

            bx1 = max(0.0, min_x - px)
            by1 = max(0.0, min_y - py)
            bx2 = min(1.0, max_x + px)
            by2 = min(1.0, max_y + py)

            bubble_list.append(
                {
                    "bbox": (bx1, by1, bx2, by2),
                    "detections": group,
                    "center": ((bx1 + bx2) / 2.0, (by1 + by2) / 2.0),
                }
            )

        return self.sort_elements_by_reading_order(bubble_list, reading_direction=reading_direction)

    def associate_text_with_panels(
        self,
        panels: List[Tuple[float, float, float, float]],
        text_detections: List[Dict[str, Any]],
        preserve_outside_text: bool = False,
        reading_direction: str = "rtl",
    ) -> List[List[Dict[str, Any]]]:
        """
        Assign each text detection to a panel using Containment Ratio:
        Containment = Area(Text ∩ Panel) / Area(Text) >= 0.35.
        If preserve_outside_text is True:
            Unassigned text detections outside all panels are clustered into
            independent speech bubbles and returned as additional panel text groups.
        Otherwise:
            Fallback to minimum Euclidean distance between centers.
        Returns a list of text lists, one per panel (plus outside bubbles if preserved).
        """
        if not panels:
            if preserve_outside_text and text_detections:
                bubbles = self.cluster_text_into_bubbles(text_detections, reading_direction=reading_direction)
                return [b["detections"] for b in bubbles]
            return []

        panel_texts: List[List[Dict[str, Any]]] = [[] for _ in panels]
        unassigned_detections: List[Dict[str, Any]] = []

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

            cx, cy = det["center"]
            point_inside = False
            if best_panel_idx != -1:
                pp = panels[best_panel_idx]
                point_inside = pp[0] <= cx <= pp[2] and pp[1] <= cy <= pp[3]

            if best_panel_idx != -1 and (best_containment >= 0.35 or point_inside):
                panel_texts[best_panel_idx].append(det)
            else:
                if preserve_outside_text:
                    unassigned_detections.append(det)
                else:
                    min_dist = float("inf")
                    fallback_idx = 0
                    for p_idx, (px1, py1, px2, py2) in enumerate(panels):
                        pc_x = (px1 + px2) / 2.0
                        pc_y = (py1 + py2) / 2.0
                        dist = math.hypot(cx - pc_x, cy - pc_y)
                        if dist < min_dist:
                            min_dist = dist
                            fallback_idx = p_idx
                    panel_texts[fallback_idx].append(det)

        for p_idx in range(len(panel_texts)):
            if len(panel_texts[p_idx]) > 1:
                # Group text detections in this panel into bubbles, ordered by reading direction
                panel_bubbles = self.cluster_text_into_bubbles(panel_texts[p_idx], reading_direction=reading_direction)
                ordered_dets = []
                for b in panel_bubbles:
                    ordered_dets.extend(b["detections"])
                panel_texts[p_idx] = ordered_dets
            elif len(panel_texts[p_idx]) == 1:
                pass

        if preserve_outside_text and unassigned_detections:
            outside_bubbles = self.cluster_text_into_bubbles(unassigned_detections, reading_direction=reading_direction)
            for ob in outside_bubbles:
                for d in ob["detections"]:
                    d["outside_bubble_bbox"] = ob["bbox"]
                panel_texts.append(ob["detections"])

        return panel_texts

    def is_blank_or_uniform_page(self, img: np.ndarray, std_thresh: float = 6.0) -> bool:
        """
        Check if an image is blank, solid black/white, or contains almost zero visual information.
        Avoids wasting OCR on empty spacer pages or corrupted frames.
        """
        if img is None:
            return True
        try:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
            _, stddev = cv2.meanStdDev(gray)
            return float(stddev[0][0]) < std_thresh
        except Exception as e:
            logger.warning(f"Error checking blank page: {e}")
            return False

    def compute_image_phash(self, img: np.ndarray) -> Optional[str]:
        """Compute perceptual hash (pHash) to detect duplicate credit pages across chapters."""
        if img is None:
            return None
        try:
            import imagehash

            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB) if len(img.shape) == 3 else img
            pil_img = Image.fromarray(rgb)
            return str(imagehash.phash(pil_img))
        except Exception as e:
            logger.warning(f"Error computing pHash: {e}")
            return None

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

            if cropped.mode != "RGB":
                cropped = cropped.convert("RGB")

            buffer = io.BytesIO()
            cropped.save(buffer, format="JPEG", quality=quality, optimize=True)
            buffer.seek(0)
            return buffer

    def analyze_page_v3(
        self,
        image_bytes: bytes,
        context: Any,
        options: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """Compatibility facade delegating to VisionPipelineV3."""
        from backend.services.vision.pipeline import vision_pipeline_v3

        return vision_pipeline_v3.analyze_page(image_bytes, context, options=options)


vision_service = VisionService()
