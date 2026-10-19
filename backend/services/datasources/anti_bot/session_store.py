import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def redact_token(token: Optional[str], visible_prefix: int = 3, visible_suffix: int = 3) -> str:
    """Redacts sensitive tokens for logging, e.g. 'sec***123'."""
    if not token:
        return ""
    if len(token) <= visible_prefix + visible_suffix:
        return "***"
    return f"{token[:visible_prefix]}***{token[-visible_suffix:]}"


class SessionStore:
    """
    Manages persistent browser storage states (cookies, localStorage, user-agent)
    per datasource provider to maintain long-lived Cloudflare clearance sessions.
    """

    def __init__(
        self,
        base_dir: str = "backend/data/datasource-sessions",
        provider: Optional[str] = None,
    ):
        self.base_dir = os.path.abspath(base_dir)
        self.default_provider = provider.strip().lower() if provider else None

    def _get_provider_dir(self, provider: Optional[str] = None) -> str:
        target = (provider or self.default_provider or "default").strip().lower()
        provider_dir = os.path.join(self.base_dir, target)
        os.makedirs(provider_dir, exist_ok=True)
        return provider_dir

    def _get_session_path(self, provider: str) -> str:
        return os.path.join(self._get_provider_dir(provider), "storage_state.json")

    def get_session_file(self, provider: str = "comix") -> Path:
        """Returns the Path to the session storage_state.json for the given provider."""
        return Path(self._get_session_path(provider))

    def get_session_path(self, provider: str = "comix") -> str:
        """Returns the string path to the session storage_state.json for the given provider."""
        return self._get_session_path(provider)

    def has_valid_session(self, provider: str) -> bool:
        """
        Checks whether a saved session exists and has an unexpired cf_clearance cookie
        or valid session tokens.
        """
        session_file = self._get_session_path(provider)
        if not os.path.exists(session_file):
            return False

        try:
            with open(session_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            cookies = data.get("cookies", [])
            if not cookies:
                return False

            now = time.time()
            # If cf_clearance is present, verify expiry
            for c in cookies:
                if c.get("name") == "cf_clearance":
                    expires = c.get("expires", -1)
                    if expires > 0 and expires < now:
                        logger.info(f"Session for '{provider}' has expired cf_clearance")
                        return False
                    return True

            # If no cf_clearance specifically, check if any non-expired session cookies exist
            return len(cookies) > 0
        except Exception as e:
            logger.warning(f"Error reading session file for '{provider}': {e}")
            return False

    def load_session(self, provider: str) -> Optional[Dict[str, Any]]:
        """Loads and returns storage state dictionary if available and valid."""
        if not self.has_valid_session(provider):
            return None

        session_file = self._get_session_path(provider)
        try:
            with open(session_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load session for '{provider}': {e}")
            return None

    def save_session(
        self,
        provider: str,
        cookies: List[Dict[str, Any]],
        origins: Optional[List[Dict[str, Any]]] = None,
        user_agent: Optional[str] = None,
    ) -> str:
        """Saves session cookies and browser metadata to storage_state.json."""
        session_file = self._get_session_path(provider)
        payload = {
            "provider": provider.lower(),
            "user_agent": user_agent or "",
            "cookies": cookies,
            "origins": origins or [],
            "saved_at": time.time(),
        }

        with open(session_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)

        has_cf = any(c.get("name") == "cf_clearance" for c in cookies)
        logger.info(f"Saved storage_state for '{provider}' with {len(cookies)} cookies (cf_clearance={has_cf})")
        return session_file

    def get_cookie_value(self, provider: str, cookie_name: str) -> Optional[str]:
        """Retrieves raw value of a specific cookie from the stored session."""
        session = self.load_session(provider)
        if not session:
            return None
        for c in session.get("cookies", []):
            if c.get("name") == cookie_name:
                return c.get("value")
        return None

    def get_redacted_cookies(self, provider: str) -> List[Dict[str, Any]]:
        """Returns cookie list with sensitive values redacted for UI/logging."""
        session = self.load_session(provider)
        if not session:
            return []
        redacted = []
        for c in session.get("cookies", []):
            item = dict(c)
            name = item.get("name", "")
            if name in ("cf_clearance", "session_id", "token", "PHPSESSID"):
                item["value"] = redact_token(item.get("value"))
            redacted.append(item)
        return redacted

    def clear_session(self, provider: str) -> None:
        """Removes stored session file."""
        session_file = self._get_session_path(provider)
        if os.path.exists(session_file):
            try:
                os.remove(session_file)
                logger.info(f"Cleared session file for '{provider}'")
            except Exception as e:
                logger.error(f"Failed to clear session file for '{provider}': {e}")
