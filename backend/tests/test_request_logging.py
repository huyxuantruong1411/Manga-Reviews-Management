"""Unit tests for RequestLoggingMiddleware (backend/core/request_logging.py)."""

import asyncio

from starlette.applications import Starlette
from starlette.responses import JSONResponse, StreamingResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from backend.core.request_logging import RequestLoggingMiddleware


async def homepage(request):
    return JSONResponse({"status": "ok"})


async def health(request):
    return JSONResponse({"status": "healthy"})


async def error_endpoint(request):
    return JSONResponse({"error": "not found"}, status_code=404)


async def stream_endpoint(request):
    async def event_generator():
        for i in range(3):
            yield f"data: event {i}\n\n"
            await asyncio.sleep(0.01)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


app = Starlette(
    routes=[
        Route("/", homepage),
        Route("/health", health),
        Route("/error", error_endpoint),
        Route("/stream", stream_endpoint),
    ]
)
app.add_middleware(RequestLoggingMiddleware)


def test_request_id_generated_and_returned_in_header():
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    req_id = response.headers.get("x-request-id")
    assert req_id is not None
    assert len(req_id) >= 8


def test_valid_client_request_id_preserved():
    client = TestClient(app)
    custom_id = "custom-client-req-id-12345"
    response = client.get("/", headers={"X-Request-ID": custom_id})
    assert response.status_code == 200
    assert response.headers.get("x-request-id") == custom_id


def test_invalid_client_request_id_regenerated():
    client = TestClient(app)
    # Too short (< 8 chars) or containing invalid chars
    bad_id = "bad"
    response = client.get("/", headers={"X-Request-ID": bad_id})
    assert response.status_code == 200
    returned_id = response.headers.get("x-request-id")
    assert returned_id != bad_id
    assert len(returned_id) >= 8


def test_health_skip_path_executes_normally():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
    assert "x-request-id" in response.headers


def test_streaming_sse_supported():
    client = TestClient(app)
    response = client.get("/stream")
    assert response.status_code == 200
    assert "data: event 0" in response.text
    assert "data: event 2" in response.text
    assert "x-request-id" in response.headers
