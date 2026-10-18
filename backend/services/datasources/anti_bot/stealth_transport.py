import asyncio
import logging
import os
import time
from typing import Any, Dict, List, Optional

from backend.models.datasource import (
    SourceRequiresSessionError,
    SourceUnavailableError,
)
from backend.services.datasources.anti_bot.challenge_detector import ChallengeDetector, ChallengeType
from backend.services.datasources.anti_bot.local_ai_solver import LocalCaptchaSolver
from backend.services.datasources.anti_bot.session_store import SessionStore

logger = logging.getLogger(__name__)

DEFAULT_STEALTH_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


class StealthTransport:
    """
    Orchestrates Stealth Browser contexts, Session Persistence,
    Challenge Detection, and Local AI Solvers for anti-bot protected sites.
    """

    def __init__(
        self,
        provider: str = "comix",
        session_store: Optional[SessionStore] = None,
        solver: Optional[LocalCaptchaSolver] = None,
        detector: Optional[ChallengeDetector] = None,
        user_agent: str = DEFAULT_STEALTH_USER_AGENT,
    ):
        self.provider = provider.lower()
        self.session_store = session_store or SessionStore()
        self.solver = solver or LocalCaptchaSolver()
        self.detector = detector or ChallengeDetector()
        self.user_agent = user_agent

    def get_browser_args(self) -> List[str]:
        return [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-infobars",
            "--disable-dev-shm-usage",
            "--disable-extensions",
        ]

    async def create_stealth_context(self, playwright_instance: Any, headless: bool = True) -> Any:
        """Launches a browser and creates an evasion-hardened context."""
        browser = await playwright_instance.chromium.launch(
            headless=headless,
            args=self.get_browser_args(),
        )

        session_path = self.session_store._get_session_path(self.provider)
        storage_state = session_path if self.session_store.has_valid_session(self.provider) else None

        context = await browser.new_context(
            user_agent=self.user_agent,
            viewport={"width": 1366, "height": 768},
            locale="en-US",
            timezone_id="Asia/Ho_Chi_Minh",
            storage_state=storage_state,
        )

        # Evasion scripts to bypass webdriver detection
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        """)

        return browser, context

    async def fetch_page_content(self, url: str, wait_selector: Optional[str] = None) -> str:
        """
        Navigates to URL, handles challenges via LocalCaptchaSolver if needed,
        saves refreshed session, and returns final HTML content.
        """
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser, context = await self.create_stealth_context(p, headless=True)
            page = await context.new_page()

            try:
                logger.info(f"StealthTransport navigating to: {url}")
                resp = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                status = resp.status if resp else 200

                content = await page.content()
                challenge = self.detector.detect(status, content)

                if challenge == ChallengeType.HARD_BLOCKED:
                    raise SourceRequiresSessionError(f"IP address hard blocked by '{self.provider}'. HITL required.")

                if challenge == ChallengeType.CF_TURNSTILE_CHECKBOX:
                    logger.info(f"Detected Cloudflare Turnstile on '{self.provider}'. Attempting local resolution...")

                    async def resolve_action():
                        return await self.solver.solve_turnstile_on_page(page)

                    solved = await self.solver.execute_with_retry(self.provider, resolve_action)
                    if solved:
                        cookies = await context.cookies()
                        self.session_store.save_session(self.provider, cookies=cookies, user_agent=self.user_agent)
                        content = await page.content()

                if wait_selector:
                    try:
                        await page.wait_for_selector(wait_selector, timeout=8000)
                        content = await page.content()
                    except Exception:
                        pass

                return content
            except SourceRequiresSessionError:
                raise
            except Exception as e:
                logger.error(f"StealthTransport fetch error for '{url}': {e}")
                raise SourceUnavailableError(f"Failed to fetch content from {url}: {e}") from e
            finally:
                await browser.close()

    async def warmup_session_interactive(
        self,
        target_url: str,
        timeout_seconds: int = 120,
    ) -> Dict[str, Any]:
        """
        Human-in-the-Loop (HITL) warmup: opens a visible (headed) browser on the host
        machine for the user to solve any interactive CAPTCHA. Automatically harvests
        the resulting session cookies upon resolution.
        """
        from playwright.async_api import async_playwright

        logger.info(f"Launching HITL interactive session warmup for '{self.provider}' at: {target_url}")

        async with async_playwright() as p:
            browser, context = await self.create_stealth_context(p, headless=False)
            page = await context.new_page()

            try:
                await page.goto(target_url, wait_until="domcontentloaded", timeout=45000)

                start_time = time.time()
                while time.time() - start_time < timeout_seconds:
                    await asyncio.sleep(2.0)
                    cur_title = (await page.title()).lower()
                    cookies = await context.cookies()

                    has_cf_clearance = any(c.get("name") == "cf_clearance" for c in cookies)
                    is_clean_title = "just a moment" not in cur_title and "security verification" not in cur_title

                    if has_cf_clearance or (is_clean_title and len(cookies) > 0):
                        self.session_store.save_session(
                            self.provider, cookies=cookies, user_agent=self.user_agent
                        )
                        self.solver.reset_failures(self.provider)
                        logger.info(f"HITL session warmup for '{self.provider}' succeeded with {len(cookies)} cookies!")
                        return {
                            "success": True,
                            "provider": self.provider,
                            "cookies_count": len(cookies),
                            "has_cf_clearance": has_cf_clearance,
                        }

                raise SourceRequiresSessionError(
                    f"HITL session warmup for '{self.provider}' timed out after {timeout_seconds}s."
                )
            finally:
                await browser.close()
