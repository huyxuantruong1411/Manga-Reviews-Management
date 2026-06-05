import httpx
import time
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

AUTH_URL = "https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token"

# Buffer in seconds: refresh the token 60s before it actually expires
# to avoid edge-case failures when a request is made right at the boundary.
EXPIRY_BUFFER_SECONDS = 60


class MangaDexAuthManager:
    """
    Manages OAuth2 token lifecycle for MangaDex API.
    
    Provides automatic login (grant_type=password) and token refresh
    (grant_type=refresh_token). This manager is designed as a fallback layer:
    it is only invoked when an anonymous API request has already failed.
    
    If credentials are not configured in settings, all methods gracefully
    return None, effectively disabling the auth fallback without errors.
    """

    def __init__(self):
        self._access_token: Optional[str] = None
        self._refresh_token: Optional[str] = None
        self._expires_at: float = 0.0  # Unix timestamp
        self._refresh_expires_at: float = 0.0
        self._lock = asyncio.Lock()
        self._enabled: Optional[bool] = None  # Lazy-checked

    def _is_enabled(self) -> bool:
        """Check if MangaDex auth credentials are configured."""
        if self._enabled is not None:
            return self._enabled

        from backend.config import settings
        has_creds = all([
            settings.mangadex_client_id,
            settings.mangadex_client_secret,
            settings.mangadex_username,
            settings.mangadex_password,
        ])
        self._enabled = has_creds
        if has_creds:
            logger.info("MangaDex Auth Fallback: ENABLED (credentials configured)")
        else:
            logger.info("MangaDex Auth Fallback: DISABLED (credentials not configured)")
        return self._enabled

    async def get_access_token(self) -> Optional[str]:
        """
        Get a valid access token, refreshing or re-authenticating as needed.
        
        Returns None if:
        - Credentials are not configured
        - Both refresh and login attempts fail
        """
        if not self._is_enabled():
            return None

        async with self._lock:
            now = time.time()

            # Case 1: Token still valid
            if self._access_token and now < (self._expires_at - EXPIRY_BUFFER_SECONDS):
                return self._access_token

            # Case 2: Access token expired but refresh token still valid
            if self._refresh_token and now < (self._refresh_expires_at - EXPIRY_BUFFER_SECONDS):
                logger.info("MangaDex Auth: Access token expired, refreshing...")
                token_data = await self._refresh()
                if token_data:
                    self._update_tokens(token_data)
                    return self._access_token
                logger.warning("MangaDex Auth: Refresh failed, falling back to full login...")

            # Case 3: No valid tokens at all — do full login
            logger.info("MangaDex Auth: Performing full login...")
            token_data = await self._login()
            if token_data:
                self._update_tokens(token_data)
                return self._access_token

            logger.error("MangaDex Auth: Full login failed. Auth fallback unavailable.")
            return None

    async def _login(self) -> Optional[dict]:
        """Authenticate with grant_type=password to get fresh tokens."""
        from backend.config import settings
        payload = {
            "grant_type": "password",
            "username": settings.mangadex_username,
            "password": settings.mangadex_password,
            "client_id": settings.mangadex_client_id,
            "client_secret": settings.mangadex_client_secret,
        }
        return await self._token_request(payload)

    async def _refresh(self) -> Optional[dict]:
        """Use the refresh token to obtain a new access token."""
        from backend.config import settings
        payload = {
            "grant_type": "refresh_token",
            "refresh_token": self._refresh_token,
            "client_id": settings.mangadex_client_id,
            "client_secret": settings.mangadex_client_secret,
        }
        return await self._token_request(payload)

    async def _token_request(self, payload: dict) -> Optional[dict]:
        """Send token request to MangaDex auth server."""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    AUTH_URL,
                    data=payload,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                resp.raise_for_status()
                data = resp.json()
                logger.info(
                    f"MangaDex Auth: Token obtained successfully "
                    f"(expires_in={data.get('expires_in')}s, "
                    f"refresh_expires_in={data.get('refresh_expires_in')}s)"
                )
                return data
        except httpx.HTTPStatusError as e:
            logger.error(
                f"MangaDex Auth: Token request failed with HTTP {e.response.status_code}: "
                f"{e.response.text[:200]}"
            )
            return None
        except Exception as e:
            logger.error(f"MangaDex Auth: Token request error: {e}")
            return None

    def _update_tokens(self, token_data: dict):
        """Update stored tokens and their expiry timestamps."""
        now = time.time()
        self._access_token = token_data.get("access_token")
        self._refresh_token = token_data.get("refresh_token")
        self._expires_at = now + token_data.get("expires_in", 900)
        self._refresh_expires_at = now + token_data.get("refresh_expires_in", 7_776_000)

    def invalidate(self):
        """Force invalidation of the current access token (e.g. on 401 response)."""
        self._access_token = None
        self._expires_at = 0.0


# Singleton instance
mangadex_auth = MangaDexAuthManager()
