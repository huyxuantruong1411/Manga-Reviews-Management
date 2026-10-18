import enum
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)


class ChallengeType(str, enum.Enum):
    CLEAN = "clean"
    CF_TURNSTILE_CHECKBOX = "cf_turnstile_checkbox"
    TEXT_IMAGE_CAPTCHA = "text_image_captcha"
    SLIDER_PUZZLE_CAPTCHA = "slider_puzzle_captcha"
    SEMANTIC_GRID_CAPTCHA = "semantic_grid_captcha"
    HARD_BLOCKED = "hard_blocked"


class ChallengeDetector:
    """
    Inspects HTTP status code and HTML response content to classify
    WAF/Anti-Bot challenge types accurately.
    """

    def detect(self, status_code: int, html_content: Optional[str] = None) -> ChallengeType:
        if not html_content:
            if status_code in (403, 429, 503):
                return ChallengeType.CF_TURNSTILE_CHECKBOX
            return ChallengeType.CLEAN

        content_lower = html_content.lower()

        # 1. Hard Blocked / IP Ban check
        if status_code in (403, 401) and any(
            phrase in content_lower
            for phrase in (
                "permanently banned",
                "access denied - 1020",
                "error 1020",
                "error 1015",
                "you are unable to access",
                "has banned your ip address",
            )
        ):
            return ChallengeType.HARD_BLOCKED

        # 2. Cloudflare Turnstile / Managed Challenge check
        is_cf_title = any(
            t in content_lower
            for t in (
                "just a moment...",
                "performing security verification",
                "security verification",
                "attention required! | cloudflare",
                "checking your browser before accessing",
            )
        )
        has_turnstile_marker = any(
            marker in content_lower
            for marker in (
                "challenges.cloudflare.com",
                "cf-turnstile",
                "cf-chl-widget",
                "cf-turnstile-response",
                "challenge-platform/h/b/orchestrate",
            )
        )

        if (status_code in (403, 429, 503) or is_cf_title) and has_turnstile_marker:
            return ChallengeType.CF_TURNSTILE_CHECKBOX

        if is_cf_title:
            return ChallengeType.CF_TURNSTILE_CHECKBOX

        # 3. Slider / Puzzle piece challenge check
        if any(
            s in content_lower
            for s in (
                "geetest_slider",
                "geetest_canvas",
                "slider-button",
                "slider_puzzle",
                "captcha-slider",
                "drag the slider",
            )
        ):
            return ChallengeType.SLIDER_PUZZLE_CAPTCHA

        # 4. Semantic Grid Selection check (e.g. hCaptcha / reCAPTCHA grid)
        if any(
            g in content_lower
            for g in (
                "select all images with",
                "click on all images",
                "select all squares with",
                "recaptcha-grid",
                "hcaptcha-grid",
            )
        ):
            return ChallengeType.SEMANTIC_GRID_CAPTCHA

        # 5. Traditional Image / Text CAPTCHA check
        has_captcha_img = bool(
            re.search(r"<img[^>]+(?:class|id|src)=[\"'][^\"']*captcha[^\"']*[\"']", content_lower)
        ) or ("<img" in content_lower and "captcha" in content_lower)
        has_text_input = bool(
            re.search(r"<input[^>]+type=[\"']text[\"'][^>]+(?:name|id)=[\"'][^\"']*captcha", content_lower)
        ) or ("<form" in content_lower and "placeholder=\"enter characters\"" in content_lower)

        if has_captcha_img and has_text_input:
            return ChallengeType.TEXT_IMAGE_CAPTCHA

        # Status 200 without challenge markers is considered clean
        if status_code == 200:
            return ChallengeType.CLEAN

        if status_code in (403, 503):
            return ChallengeType.CF_TURNSTILE_CHECKBOX

        return ChallengeType.CLEAN
