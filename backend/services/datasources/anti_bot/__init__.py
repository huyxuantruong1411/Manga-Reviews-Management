"""
Anti-Bot, Stealth Transport and Local AI CAPTCHA Solver Package.
Provides session persistence, challenge detection, humanized mouse paths,
and OpenCV/RapidOCR solvers for Cloudflare and WAF protected manga sources.
"""

from backend.services.datasources.anti_bot.challenge_detector import ChallengeDetector, ChallengeType
from backend.services.datasources.anti_bot.local_ai_solver import LocalCaptchaSolver
from backend.services.datasources.anti_bot.mouse_humanizer import generate_bezier_trajectory
from backend.services.datasources.anti_bot.session_store import SessionStore, redact_token
from backend.services.datasources.anti_bot.stealth_transport import StealthTransport

__all__ = [
    "ChallengeDetector",
    "ChallengeType",
    "LocalCaptchaSolver",
    "generate_bezier_trajectory",
    "SessionStore",
    "redact_token",
    "StealthTransport",
]
