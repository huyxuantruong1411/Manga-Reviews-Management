import httpx
import time
import asyncio
import logging
import os
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

    def _load_from_fallback_file(self) -> dict:
        """
        Attempts to read credentials and tokens from mangadex_access.txt at the project root.
        """
        res = {}
        try:
            root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            filepath = os.path.join(root_dir, "mangadex_access.txt")
            if not os.path.exists(filepath):
                return res
            
            with open(filepath, "r", encoding="utf-8") as f:
                lines = f.readlines()
                
            for line in lines:
                line_str = line.strip()
                if not line_str:
                    continue
                
                if "=" in line_str:
                    parts = line_str.split("=", 1)
                    key = parts[0].strip()
                    val = parts[1].strip().strip('"').strip("'")
                    if key == "client_id":
                        res["client_id"] = val
                    elif key == "MY_USERNAME":
                        res["username"] = val
                    elif key == "MY_PASSWORD":
                        res["password"] = val
                    elif key == "MY_SECRET_KEY":
                        res["client_secret"] = val
                elif line_str.startswith("Access Token:"):
                    res["access_token"] = line_str.split("Access Token:", 1)[1].strip()
                elif line_str.startswith("Refresh Token:"):
                    res["refresh_token"] = line_str.split("Refresh Token:", 1)[1].strip()
        except Exception as e:
            logger.warning(f"Failed to read/parse mangadex_access.txt: {e}")
        return res

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
        
        fallback_data = self._load_from_fallback_file()
        has_fallback_creds = all([
            fallback_data.get("client_id"),
            fallback_data.get("client_secret"),
            fallback_data.get("username"),
            fallback_data.get("password"),
        ])
        
        if has_creds or has_fallback_creds:
            self._enabled = True
            if has_creds:
                logger.info("MangaDex Auth Fallback: ENABLED (credentials configured in settings)")
            else:
                logger.info("MangaDex Auth Fallback: ENABLED (credentials loaded from mangadex_access.txt)")
            
            # Load tokens from fallback file if available and not yet in memory
            if not self._access_token and fallback_data.get("access_token"):
                self._access_token = fallback_data["access_token"]
                self._expires_at = time.time() + 300  # Conservative expiry (5 mins)
                logger.info("MangaDex Auth: Loaded Access Token from mangadex_access.txt")
                
            if not self._refresh_token and fallback_data.get("refresh_token"):
                self._refresh_token = fallback_data["refresh_token"]
                self._refresh_expires_at = time.time() + 3000
                logger.info("MangaDex Auth: Loaded Refresh Token from mangadex_access.txt")
                
            return True
            
        self._enabled = False
        logger.info("MangaDex Auth Fallback: DISABLED (no credentials in settings or mangadex_access.txt)")
        return False

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
        client_id = settings.mangadex_client_id
        client_secret = settings.mangadex_client_secret
        username = settings.mangadex_username
        password = settings.mangadex_password
        
        if not all([client_id, client_secret, username, password]):
            fallback_data = self._load_from_fallback_file()
            client_id = client_id or fallback_data.get("client_id")
            client_secret = client_secret or fallback_data.get("client_secret")
            username = username or fallback_data.get("username")
            password = password or fallback_data.get("password")
            
        payload = {
            "grant_type": "password",
            "username": username,
            "password": password,
            "client_id": client_id,
            "client_secret": client_secret,
        }
        return await self._token_request(payload)

    async def _refresh(self) -> Optional[dict]:
        """Use the refresh token to obtain a new access token."""
        from backend.config import settings
        client_id = settings.mangadex_client_id
        client_secret = settings.mangadex_client_secret
        
        if not all([client_id, client_secret]):
            fallback_data = self._load_from_fallback_file()
            client_id = client_id or fallback_data.get("client_id")
            client_secret = client_secret or fallback_data.get("client_secret")
            
        payload = {
            "grant_type": "refresh_token",
            "refresh_token": self._refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
        }
        return await self._token_request(payload)

    async def _token_request(self, payload: dict) -> Optional[dict]:
        """Send token request to MangaDex auth server."""
        from backend.config import settings
        proxy_url = settings.mangadex_proxy or os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
        if proxy_url:
            if not (proxy_url.startswith("http://") or proxy_url.startswith("https://") or proxy_url.startswith("socks5://") or proxy_url.startswith("socks4://")):
                proxy_url = f"http://{proxy_url}"
                
        try:
            async with httpx.AsyncClient(proxy=proxy_url, timeout=15.0) as client:
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
