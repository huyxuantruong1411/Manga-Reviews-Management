#!/usr/bin/env python3
"""End-to-end verification client for the External Source Connector (local or ngrok HTTPS).

Simulates the downstream Manga Reader ETL worker (QL-DocTruyen) consuming this repository's
Data Lake Pool as a third-party manga source:
  1. Verifies security boundary (401 without API key, 403/404 on non-connector routes).
  2. Handshakes `/api/connector/v1/info` and `/api/connector/v1/contract/schema`.
  3. Discovers ready packages via `/api/connector/v1/catalog`.
  4. Fetches a strict `manga-reader-package` v2.0 package, verifies raw `X-Payload-SHA256`,
     validates every field with Pydantic v2 (`ReaderPackage`), checks RFC 3339 UTC dates,
     tests `If-None-Match` (304 Not Modified), and tests metadata-only export (`include_chapters=false`).
  5. Streams primary cover and sample chapter page bytes via `/api/connector/v1/media/{bucket}/{key}`
     and verifies `X-Content-SHA256` / byte integrity.
  6. Optionally tests CDC subscription lifecycle & polling feed (`--test-cdc`).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import quote

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.models.reader_contract import ReaderPackage  # noqa: E402


def _assert(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def _check_rfc3339_utc(value: str | None, field_name: str) -> None:
    if value is None:
        return
    _assert(
        value.endswith("Z") or value.endswith("+00:00"),
        f"{field_name} must be RFC 3339 UTC with explicit timezone suffix, got: {value!r}",
    )


def verify_connector(
    base_url: str,
    api_key: str,
    *,
    pool_manga_id: str | None = None,
    test_cdc: bool = False,
    timeout: float = 20.0,
) -> dict:
    base = base_url.rstrip("/")
    base_headers = {
        "User-Agent": "MangaReader-ETL-Verifier/1.0",
        "ngrok-skip-browser-warning": "true",
    }
    auth_headers = {**base_headers, "X-Connector-API-Key": api_key}
    report: dict = {"base_url": base, "checks": []}

    with httpx.Client(timeout=timeout, follow_redirects=False) as client:
        # 1. Security: unauthenticated request MUST fail with 401
        r_unauth = client.get(f"{base}/api/connector/v1/info", headers=base_headers)
        _assert(r_unauth.status_code == 401, f"Expected 401 without API key, got {r_unauth.status_code}")
        report["checks"].append("auth_enforced_401")

        # 2. Security: non-connector personal route MUST be blocked (403 on guarded main app, 404 on isolated app)
        r_priv = client.get(f"{base}/api/manga", headers=auth_headers)
        _assert(
            r_priv.status_code in (403, 404),
            f"Expected 403/404 on /api/manga through connector, got {r_priv.status_code}",
        )
        report["checks"].append(f"non_connector_route_blocked_{r_priv.status_code}")

        # 3. Handshake /info
        r_info = client.get(f"{base}/api/connector/v1/info", headers=auth_headers)
        _assert(r_info.status_code == 200, f"/info failed: HTTP {r_info.status_code} {r_info.text[:200]}")
        info = r_info.json()
        _assert(info["contract_name"] == "manga-reader-package", "Unexpected contract_name")
        _assert(info["contract_version"] == "2.0", "Unexpected contract_version")
        report["info"] = info
        report["checks"].append("info_ok")

        # 4. Contract Schema Draft 2020-12
        r_schema = client.get(f"{base}/api/connector/v1/contract/schema", headers=auth_headers)
        _assert(r_schema.status_code == 200, f"/contract/schema failed: HTTP {r_schema.status_code}")
        schema = r_schema.json()
        _assert(schema.get("$id") == "urn:manga-datalake:contract:manga-reader-package:2.0", "Schema $id mismatch")
        report["checks"].append("contract_schema_2020_12_ok")

        # 5. Ready Catalog
        r_cat = client.get(
            f"{base}/api/connector/v1/catalog", params={"page": 1, "page_size": 10}, headers=auth_headers
        )
        _assert(r_cat.status_code == 200, f"/catalog failed: HTTP {r_cat.status_code}")
        catalog = r_cat.json()
        items = catalog.get("items") or []
        report["catalog_total"] = catalog.get("total", 0)
        report["checks"].append(f"catalog_ok_count_{len(items)}")

        if not items and not pool_manga_id:
            report["warning"] = "Pool has 0 published ETL-ready mangas; skipped package & media verification."
            return report

        target_id = pool_manga_id or items[0]["pool_manga_id"]
        report["verified_pool_manga_id"] = target_id

        # 6. Full Package v2.0 + SHA-256 + RFC3339 + ETag 304 + metadata-only
        r_pkg = client.get(f"{base}/api/connector/v1/packages/{target_id}", headers=auth_headers)
        _assert(r_pkg.status_code == 200, f"/packages/{target_id} failed: HTTP {r_pkg.status_code}")
        raw_bytes = r_pkg.content
        computed_sha = hashlib.sha256(raw_bytes).hexdigest()
        header_sha = r_pkg.headers.get("x-payload-sha256", "")
        _assert(computed_sha == header_sha, f"Payload SHA-256 mismatch: header={header_sha} actual={computed_sha}")

        pkg_json = json.loads(raw_bytes.decode("utf-8"))
        pkg = ReaderPackage.model_validate(pkg_json)
        _check_rfc3339_utc(pkg_json.get("exported_at"), "exported_at")
        _check_rfc3339_utc(pkg_json["manga"]["lineage"].get("published_at"), "lineage.published_at")
        _check_rfc3339_utc(pkg_json["manga"]["lineage"].get("updated_at"), "lineage.updated_at")
        report["checks"].append("package_v2_validated_sha256_rfc3339_ok")

        etag = r_pkg.headers.get("etag")
        _assert(bool(etag), "Missing ETag header on package response")
        r_304 = client.get(
            f"{base}/api/connector/v1/packages/{target_id}",
            headers={**auth_headers, "If-None-Match": etag},
        )
        _assert(r_304.status_code == 304, f"Expected 304 Not Modified with matching ETag, got {r_304.status_code}")
        report["checks"].append("package_etag_304_ok")

        r_meta = client.get(
            f"{base}/api/connector/v1/packages/{target_id}",
            params={"include_chapters": "false"},
            headers=auth_headers,
        )
        _assert(r_meta.status_code == 200, f"Metadata-only package failed: HTTP {r_meta.status_code}")
        _assert("chapters" not in r_meta.json(), "ADR-012 violation: include_chapters=false must omit `chapters` key")
        report["checks"].append("metadata_only_omits_chapters_ok")

        # 7. Zero-Copy Media Proxy (Cover + Sample Chapter Page)
        media_targets = []
        if pkg.manga.primary_cover:
            media_targets.append(("primary_cover", pkg.manga.primary_cover))
        if pkg.chapters and pkg.chapters[0].pages:
            media_targets.append(("first_page", pkg.chapters[0].pages[0].media))

        for label, mref in media_targets:
            media_url = (
                f"{base}/api/connector/v1/media/{quote(mref.bucket, safe='')}/{quote(mref.object_key, safe='/')}"
            )
            r_head = client.head(media_url, headers=auth_headers)
            _assert(r_head.status_code == 200, f"HEAD {label} failed: HTTP {r_head.status_code}")

            r_get = client.get(media_url, headers=auth_headers)
            _assert(r_get.status_code == 200, f"GET {label} failed: HTTP {r_get.status_code}")
            _assert(len(r_get.content) > 0, f"GET {label} returned empty body")
            actual_media_sha = hashlib.sha256(r_get.content).hexdigest()
            _assert(
                r_get.headers.get("x-content-sha256") == actual_media_sha,
                f"{label} X-Content-SHA256 mismatch",
            )
            if mref.sha256:
                _assert(
                    mref.sha256 == actual_media_sha,
                    f"{label} manifest sha256 mismatch: expected {mref.sha256}, got {actual_media_sha}",
                )
            report["checks"].append(f"media_proxy_{label}_ok_{len(r_get.content)}B")

        # 8. Optional CDC Subscription + Polling roundtrip
        if test_cdc:
            r_sub = client.post(
                f"{base}/api/connector/v1/cdc/subscriptions",
                headers=auth_headers,
                json={
                    "pool_manga_id": target_id,
                    "callback_url": "http://127.0.0.1:8020/api/v1/webhooks/cdc",
                    "consumer_id": "verify-script-temp",
                },
            )
            _assert(r_sub.status_code == 201, f"CDC subscribe failed: HTTP {r_sub.status_code} {r_sub.text}")
            sub_key = r_sub.json()["provider_subscription_key"]

            r_ev = client.get(
                f"{base}/api/connector/v1/cdc/events",
                params={"pool_manga_id": target_id, "limit": 5},
                headers=auth_headers,
            )
            _assert(r_ev.status_code == 200, f"CDC events poll failed: HTTP {r_ev.status_code}")

            r_del = client.delete(f"{base}/api/connector/v1/cdc/subscriptions/{sub_key}", headers=auth_headers)
            _assert(r_del.status_code == 200 and r_del.json()["status"] == "CANCELLED", "CDC cancel failed")
            report["checks"].append("cdc_subscribe_poll_cancel_ok")

    return report


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Verify Manga Data Lake External Source Connector end-to-end.")
    parser.add_argument("--base-url", required=True, help="Connector base URL (e.g. https://xxxx.ngrok-free.app)")
    parser.add_argument("--api-key", required=True, help="CONNECTOR_API_KEY value")
    parser.add_argument("--pool-manga-id", default=None, help="Optional specific pool_manga_id to verify")
    parser.add_argument("--test-cdc", action="store_true", help="Also test CDC subscribe -> poll -> cancel")
    parser.add_argument("--timeout", type=float, default=20.0)
    args = parser.parse_args()

    try:
        result = verify_connector(
            args.base_url,
            args.api_key,
            pool_manga_id=args.pool_manga_id,
            test_cdc=args.test_cdc,
            timeout=args.timeout,
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
        print("\n[OK] All External Source Connector verification checks PASSED.")
        return 0
    except Exception as exc:
        print(f"[FAILED] Connector verification failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
