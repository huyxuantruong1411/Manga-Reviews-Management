import asyncio
import logging
import time

logger = logging.getLogger(__name__)


class AsyncRateLimiter:
    """
    An async rate limiter based on the Token Bucket algorithm.
    Used to limit requests to external APIs like MangaDex (max 5 reqs/sec).
    """

    def __init__(self, rate: float = 5.0, capacity: float = 5.0):
        self.rate = rate  # Tokens refilled per second
        self.capacity = capacity  # Max capacity of the bucket
        self.tokens = capacity
        self.last_update = time.monotonic()
        self.lock = asyncio.Lock()

    async def acquire(self):
        async with self.lock:
            while True:
                now = time.monotonic()
                elapsed = now - self.last_update
                self.last_update = now
                self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)

                if self.tokens >= 1.0:
                    self.tokens -= 1.0
                    return

                # Calculate sleep duration to acquire 1 token
                sleep_time = (1.0 - self.tokens) / self.rate
                logger.debug(f"Rate limiter sleeping for {sleep_time:.2f}s...")
                await asyncio.sleep(sleep_time)


# Global rate limiters
mangadex_rate_limiter = AsyncRateLimiter(rate=5.0, capacity=5.0)
# AniList API limit: 90 req/min (1.5 req/s)
anilist_rate_limiter = AsyncRateLimiter(rate=1.2, capacity=3.0)
# Jikan (MAL) API limit: 3 req/s, 60 req/min (1.0 req/s)
jikan_rate_limiter = AsyncRateLimiter(rate=1.0, capacity=2.0)
