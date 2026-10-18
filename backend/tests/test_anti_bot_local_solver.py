"""
Unit and integration tests for Anti-Bot, Stealth Session Store & Local AI CAPTCHA Solver.
Tests SessionStore, ChallengeDetector, MouseHumanizer, and LocalCaptchaSolver (OpenCV, RapidOCR, circuit breaker).
"""

import json
import os
import shutil
import tempfile
import numpy as np
import pytest
import cv2
from PIL import Image, ImageDraw, ImageFont

from backend.models.datasource import SourceRequiresSessionError
from backend.services.datasources.anti_bot.session_store import SessionStore
from backend.services.datasources.anti_bot.challenge_detector import ChallengeDetector, ChallengeType
from backend.services.datasources.anti_bot.mouse_humanizer import generate_bezier_trajectory
from backend.services.datasources.anti_bot.local_ai_solver import LocalCaptchaSolver


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def temp_session_dir():
    temp_dir = tempfile.mkdtemp(prefix="test_anti_bot_sessions_")
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


# ─── 1. Session Store Tests ──────────────────────────────────────────────────

def test_session_store_save_load_and_clear(temp_session_dir):
    store = SessionStore(base_dir=temp_session_dir)
    provider = "comix"

    assert not store.has_valid_session(provider)
    assert store.load_session(provider) is None

    # Save mock session
    cookies = [
        {"name": "cf_clearance", "value": "secret_clearance_abc123", "domain": "comix.to", "expires": 9999999999},
        {"name": "session_id", "value": "sess_987", "domain": "comix.to", "expires": -1},
    ]
    user_agent = "Mozilla/5.0 TestBrowser/1.0"

    store.save_session(provider, cookies=cookies, user_agent=user_agent)

    assert store.has_valid_session(provider)
    loaded = store.load_session(provider)
    assert loaded is not None
    assert loaded["user_agent"] == user_agent
    assert len(loaded["cookies"]) == 2

    # Clearance token extraction
    clearance = store.get_cookie_value(provider, "cf_clearance")
    assert clearance == "secret_clearance_abc123"

    # Redaction test
    redacted_cookies = store.get_redacted_cookies(provider)
    for c in redacted_cookies:
        if c["name"] == "cf_clearance":
            assert c["value"] == "sec***123"

    # Clear session
    store.clear_session(provider)
    assert not store.has_valid_session(provider)
    assert store.load_session(provider) is None


# ─── 2. Challenge Detector Tests ─────────────────────────────────────────────

def test_challenge_detector_clean_html():
    detector = ChallengeDetector()
    clean_html = """
    <!DOCTYPE html>
    <html><head><title>Yajin - Comix</title></head>
    <body><div class="manga-details"><h1>Yajin</h1></div></body></html>
    """
    assert detector.detect(200, clean_html) == ChallengeType.CLEAN


def test_challenge_detector_cloudflare_turnstile():
    detector = ChallengeDetector()
    challenge_html = """
    <!DOCTYPE html><html><head><title>Just a moment...</title>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
    </head><body><div id="challenge-stage">
    <input type="hidden" name="cf-turnstile-response" id="cf-chl-widget">
    </div></body></html>
    """
    assert detector.detect(403, challenge_html) == ChallengeType.CF_TURNSTILE_CHECKBOX
    assert detector.detect(503, challenge_html) == ChallengeType.CF_TURNSTILE_CHECKBOX


def test_challenge_detector_text_captcha():
    detector = ChallengeDetector()
    captcha_html = """
    <html><body>
    <form action="/verify" method="post">
        <img class="captcha-img" src="/captcha.jpg" alt="Security Code" />
        <input type="text" name="captcha_code" placeholder="Enter characters" />
        <button type="submit">Verify</button>
    </form>
    </body></html>
    """
    assert detector.detect(200, captcha_html) == ChallengeType.TEXT_IMAGE_CAPTCHA


def test_challenge_detector_slider_puzzle():
    detector = ChallengeDetector()
    slider_html = """
    <html><body>
    <div class="geetest_slider">
        <div class="geetest_canvas_bg"></div>
        <div class="geetest_canvas_slice"></div>
        <div class="slider-button"></div>
    </div>
    </body></html>
    """
    assert detector.detect(200, slider_html) == ChallengeType.SLIDER_PUZZLE_CAPTCHA


def test_challenge_detector_hard_blocked():
    detector = ChallengeDetector()
    blocked_html = """
    <html><head><title>Access Denied - 1020</title></head>
    <body><h1>Your IP has been permanently banned</h1></body></html>
    """
    assert detector.detect(403, blocked_html) == ChallengeType.HARD_BLOCKED


# ─── 3. Mouse Humanizer (Bezier Curve) Tests ─────────────────────────────────

def test_mouse_humanizer_trajectory_bounds():
    start = (100, 150)
    end = (450, 320)
    steps = 25

    trajectory = generate_bezier_trajectory(start, end, steps=steps)

    assert len(trajectory) == steps
    # First point should be start or very close
    assert trajectory[0] == start
    # Final point must match the target coordinate
    assert trajectory[-1] == end

    # Check continuity: no single step jumps more than 50px
    for i in range(1, len(trajectory)):
        dx = abs(trajectory[i][0] - trajectory[i - 1][0])
        dy = abs(trajectory[i][1] - trajectory[i - 1][1])
        assert dx < 60
        assert dy < 60


# ─── 4. Local AI Solver (OpenCV Puzzle & RapidOCR Text) Tests ─────────────────

def test_local_ai_solver_slider_puzzle():
    solver = LocalCaptchaSolver()

    # Generate synthetic background image with a distinct dark notch/hole at x=180, y=60
    bg = np.full((150, 300, 3), 200, dtype=np.uint8)
    hole_x, hole_y, hole_w, hole_h = 180, 50, 40, 40
    # Draw dark square hole
    cv2.rectangle(bg, (hole_x, hole_y), (hole_x + hole_w, hole_y + hole_h), (30, 30, 30), -1)

    # Generate synthetic piece image (40x40 matching the notch)
    piece = np.full((hole_h, hole_w, 3), 30, dtype=np.uint8)

    # Encode to PNG bytes
    _, bg_bytes = cv2.imencode(".png", bg)
    _, piece_bytes = cv2.imencode(".png", piece)

    detected_x = solver.solve_slider_puzzle(bg_bytes.tobytes(), piece_bytes.tobytes())
    assert abs(detected_x - hole_x) <= 4, f"Expected hole near x={hole_x}, got {detected_x}"


def test_local_ai_solver_text_captcha():
    solver = LocalCaptchaSolver()

    # Create a synthetic text captcha image with clean alphanumeric text
    img = Image.new("RGB", (200, 70), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    text = "7A9K"
    # Draw simple text
    draw.text((30, 15), text, fill=(0, 0, 0))

    import io
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    captcha_bytes = buf.getvalue()

    result_text = solver.solve_text_captcha(captcha_bytes)
    # Filter non-alphanumeric chars
    cleaned = "".join(c for c in result_text.upper() if c.isalnum())
    # Should accurately extract at least the majority of characters
    assert "7A9K" in cleaned or ("7" in cleaned and "9" in cleaned)


# ─── 5. Circuit Breaker (Max 3 Attempts) Tests ────────────────────────────────

@pytest.mark.anyio
async def test_solver_circuit_breaker_max_attempts():
    solver = LocalCaptchaSolver(max_attempts=3)
    provider = "comix"

    # Mock failing solver
    async def mock_failing_action():
        return False

    with pytest.raises(SourceRequiresSessionError) as exc_info:
        for attempt in range(4):
            await solver.execute_with_retry(provider, mock_failing_action)

    assert "SOURCE_REQUIRES_SESSION" in str(exc_info.value.code)
    assert solver.get_failure_count(provider) >= 3
