"""Bounded public-image downloads; revalidate each redirect before following it."""

import asyncio
import io
import ipaddress
import socket
from urllib.parse import urljoin, urlsplit

import httpx
from PIL import Image

MAX_IMAGE_BYTES = 12 * 1024 * 1024


async def validate_public_url(url: str) -> None:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Only public HTTP(S) image URLs without credentials are supported")
    if parsed.hostname.lower() == "localhost" or parsed.hostname.lower().endswith((".localhost", ".local")):
        raise ValueError("Local network image URLs are not allowed")
    addresses = await asyncio.to_thread(
        socket.getaddrinfo,
        parsed.hostname,
        parsed.port or (443 if parsed.scheme == "https" else 80),
        type=socket.SOCK_STREAM,
    )
    if not addresses or any(not ipaddress.ip_address(address[4][0]).is_global for address in addresses):
        raise ValueError("Private, loopback and reserved network image URLs are not allowed")


async def fetch_public_image(url: str) -> tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=20, follow_redirects=False, trust_env=False) as client:
        for _ in range(5):
            await validate_public_url(url)
            async with client.stream("GET", url, headers={"Accept": "image/*"}) as response:
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        raise ValueError("Image redirect is missing a location")
                    url = urljoin(url, location)
                    continue
                response.raise_for_status()
                if int(response.headers.get("content-length", "0")) > MAX_IMAGE_BYTES:
                    raise ValueError("Image exceeds the 12 MB limit")
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > MAX_IMAGE_BYTES:
                        raise ValueError("Image exceeds the 12 MB limit")
                with Image.open(io.BytesIO(data)) as image:
                    if image.width * image.height > 40_000_000:
                        raise ValueError("Image dimensions exceed the supported limit")
                    content_type = Image.MIME.get(image.format)
                    if content_type not in {
                        "image/jpeg",
                        "image/png",
                        "image/webp",
                        "image/gif",
                        "image/bmp",
                        "image/tiff",
                    }:
                        raise ValueError("Unsupported image format")
                    image.verify()
                return bytes(data), content_type
    raise ValueError("Too many image redirects")
