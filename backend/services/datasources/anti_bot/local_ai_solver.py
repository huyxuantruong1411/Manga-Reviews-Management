import asyncio
import io
import logging
import random
from typing import Any, Callable, Dict, Optional, Tuple

import cv2
import numpy as np
from PIL import Image

from backend.models.datasource import SourceRequiresSessionError
from backend.services.datasources.anti_bot.mouse_humanizer import generate_bezier_trajectory

logger = logging.getLogger(__name__)


class LocalCaptchaSolver:
    """
    Coordinates local Computer Vision (OpenCV), OCR (RapidOCR PP-OCRv4),
    and mouse movement humanization to solve challenges without external paid APIs.
    Enforces a strict circuit breaker of max_attempts (default 3).
    """

    def __init__(self, max_attempts: int = 3):
        self.max_attempts = max_attempts
        self._failures: Dict[str, int] = {}
        self._ocr = None

    def _get_ocr(self):
        if self._ocr is None:
            try:
                from rapidocr_onnxruntime import RapidOCR

                self._ocr = RapidOCR()
            except Exception as e:
                logger.error(f"Failed to initialize RapidOCR: {e}")
                raise
        return self._ocr

    def get_failure_count(self, provider: str) -> int:
        return self._failures.get(provider.lower(), 0)

    def reset_failures(self, provider: str) -> None:
        self._failures[provider.lower()] = 0

    async def execute_with_retry(self, provider: str, action: Callable) -> Any:
        """
        Executes an action with circuit breaker checking.
        If attempts exceed max_attempts, raises SourceRequiresSessionError.
        """
        clean_provider = provider.lower()
        current_fails = self.get_failure_count(clean_provider)

        if current_fails >= self.max_attempts:
            raise SourceRequiresSessionError(
                f"Anti-Bot challenge exceeded max attempts ({self.max_attempts}) for '{provider}'. Human verification required."
            )

        try:
            if asyncio.iscoroutinefunction(action):
                success = await action()
            else:
                success = action()

            if success:
                self.reset_failures(clean_provider)
                return success
            else:
                self._failures[clean_provider] = current_fails + 1
                if self._failures[clean_provider] >= self.max_attempts:
                    raise SourceRequiresSessionError(
                        f"Anti-Bot challenge failed {self.max_attempts} consecutive times for '{provider}'."
                    )
                return False
        except SourceRequiresSessionError:
            raise
        except Exception as e:
            self._failures[clean_provider] = current_fails + 1
            logger.warning(
                f"Error during challenge action for '{provider}' (attempt {self._failures[clean_provider]}/{self.max_attempts}): {e}"
            )
            if self._failures[clean_provider] >= self.max_attempts:
                raise SourceRequiresSessionError(
                    f"Anti-Bot challenge failed {self.max_attempts} times for '{provider}'."
                ) from e
            return False

    def solve_slider_puzzle(self, bg_bytes: bytes, piece_bytes: bytes) -> int:
        """
        Finds the horizontal X offset of the missing puzzle hole in the background image
        using OpenCV GaussianBlur, Canny edge detection, and template matching.
        """
        bg_arr = np.frombuffer(bg_bytes, np.uint8)
        piece_arr = np.frombuffer(piece_bytes, np.uint8)

        bg_img = cv2.imdecode(bg_arr, cv2.IMREAD_COLOR)
        piece_img = cv2.imdecode(piece_arr, cv2.IMREAD_COLOR)

        if bg_img is None or piece_img is None:
            raise ValueError("Failed to decode image bytes for slider puzzle")

        # Convert to grayscale
        bg_gray = cv2.cvtColor(bg_img, cv2.COLOR_BGR2GRAY)
        piece_gray = cv2.cvtColor(piece_img, cv2.COLOR_BGR2GRAY)

        # Apply slight blur to reduce background texture noise
        bg_blur = cv2.GaussianBlur(bg_gray, (3, 3), 0)
        piece_blur = cv2.GaussianBlur(piece_gray, (3, 3), 0)

        # Canny edge detection
        bg_edges = cv2.Canny(bg_blur, 50, 150)
        piece_edges = cv2.Canny(piece_blur, 50, 150)

        # If piece has enough distinctive edges, use edge matching
        if np.count_nonzero(piece_edges) > 10:
            res = cv2.matchTemplate(bg_edges, piece_edges, cv2.TM_CCOEFF_NORMED)
            _, max_val, _, max_loc = cv2.minMaxLoc(res)
            detected_x = int(max_loc[0])
            confidence = max_val
        else:
            # Fallback to direct grayscale template matching with SQDIFF
            res = cv2.matchTemplate(bg_gray, piece_gray, cv2.TM_SQDIFF_NORMED)
            min_val, _, min_loc, _ = cv2.minMaxLoc(res)
            detected_x = int(min_loc[0])
            confidence = 1.0 - float(min_val)

        logger.info(f"Solved slider puzzle offset X={detected_x} (match confidence={confidence:.2f})")
        return detected_x

    def solve_text_captcha(self, image_bytes: bytes) -> str:
        """
        Extracts alphanumeric text from a captcha image using OpenCV preprocessing
        and RapidOCR (PP-OCRv4 ONNX).
        """
        arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode captcha image bytes")

        # Preprocessing: convert to grayscale, normalize contrast
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Apply bilateral filter to smooth noise while keeping edges crisp
        denoised = cv2.bilateralFilter(gray, 9, 75, 75)

        ocr = self._get_ocr()
        results, _ = ocr(denoised)

        if not results:
            # Fallback on raw color image
            results, _ = ocr(img)

        if not results:
            return ""

        extracted_text = "".join(line[1] for line in results if len(line) >= 2)
        cleaned = "".join(c for c in extracted_text if c.isalnum())
        logger.info(f"Extracted captcha text: '{cleaned}' (raw: '{extracted_text}')")
        return cleaned

    async def solve_turnstile_on_page(self, page: Any) -> bool:
        """
        Locates the Cloudflare Turnstile widget or iframe on a Playwright page,
        computes coordinates, moves mouse via Bezier trajectory, and performs a natural click.
        """
        try:
            # Wait up to 5s for the Turnstile widget/iframe to be attached
            await asyncio.sleep(2.0)

            frame_elem = await page.query_selector(
                'iframe[src*="cloudflare.com"], iframe[src*="turnstile"], #challenge-stage iframe'
            )
            if not frame_elem:
                logger.debug("No Cloudflare Turnstile iframe found on page")
                return False

            box = await frame_elem.bounding_box()
            if not box:
                logger.debug("Turnstile iframe bounding box unavailable")
                return False

            # Checkbox is typically located around x = box['x'] + 30..40, y = box['y'] + box['height'] / 2
            target_x = int(box["x"] + min(35.0, box["width"] * 0.2))
            target_y = int(box["y"] + box["height"] / 2.0)

            # Current mouse position or default from top-left offset
            start_pos = (random.randint(50, 200), random.randint(50, 200))
            trajectory = generate_bezier_trajectory(start_pos, (target_x, target_y), steps=20)

            for x, y in trajectory:
                await page.mouse.move(x, y)
                await asyncio.sleep(random.uniform(0.01, 0.025))

            # Natural hesitation before click (80 - 200ms)
            await asyncio.sleep(random.uniform(0.08, 0.20))
            await page.mouse.down()
            await asyncio.sleep(random.uniform(0.06, 0.12))
            await page.mouse.up()

            logger.info(f"Clicked Turnstile checkbox at ({target_x}, {target_y})")

            # Wait up to 8s for challenge to resolve
            for _ in range(8):
                await asyncio.sleep(1.0)
                cur_title = (await page.title()).lower()
                if "just a moment" not in cur_title and "security verification" not in cur_title:
                    logger.info("Turnstile challenge resolved successfully!")
                    return True

            return False
        except Exception as e:
            logger.warning(f"Error during turnstile resolution on page: {e}")
            return False
