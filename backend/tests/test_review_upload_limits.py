import io
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, UploadFile
from PIL import Image

from backend.services import review_media_service as media


@pytest.mark.anyio
async def test_oversized_upload_stops_reading_at_limit():
    upload = UploadFile(file=io.BytesIO(b"x" * 100), filename="test.bin")
    with pytest.raises(HTTPException) as error:
        await media.read_bounded_upload(upload, 10)
    assert error.value.status_code == 413
    assert upload.file.tell() == 11


@pytest.mark.parametrize("payload", [b"<svg><script>alert(1)</script></svg>", b"not an image"])
def test_invalid_or_active_image_content_is_rejected(payload):
    with pytest.raises(HTTPException) as error:
        media.validate_image_upload(payload)
    assert error.value.status_code == 415


def test_image_mime_and_extension_come_from_decoded_bytes():
    data = io.BytesIO()
    Image.new("RGB", (3, 3), "white").save(data, "PNG")
    assert media.validate_image_upload(data.getvalue()) == ("image/png", "png")


@pytest.mark.anyio
async def test_empty_upload_rejected():
    with pytest.raises(HTTPException) as error:
        await media.read_bounded_upload(AsyncMock(read=AsyncMock(return_value=b"")), 100)
    assert error.value.status_code == 422
