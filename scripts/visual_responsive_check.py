"""Visual Responsive & UI Inspection Script using Playwright.

Captures screenshots across multiple device viewports (mobile, tablet, desktop)
and color schemes (light/dark) for visual QA and responsive layout verification.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import List, Tuple

try:
    from playwright.sync_api import sync_playwright  # pyright: ignore[reportMissingImports]
except ImportError:
    sync_playwright = None  # type: ignore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("visual_responsive_check")

# Standard viewports for mobile-first testing
DEFAULT_VIEWPORTS: List[Tuple[str, int, int]] = [
    ("mobile_375px", 375, 812),  # iPhone SE / Mobile portrait
    ("tablet_768px", 768, 1024),  # iPad portrait / Small tablet
    ("desktop_1280px", 1280, 800),  # Standard laptop / Small desktop
    ("desktop_1920px", 1920, 1080),  # Full HD wide desktop
]


def capture_responsive_snapshots(
    base_url: str,
    routes: List[str],
    output_dir: Path,
    viewports: List[Tuple[str, int, int]],
    full_page: bool = True,
    dark_mode: bool = False,
    wait_time_ms: int = 1500,
) -> List[Path]:
    """Capture responsive screenshots across routes and viewports."""
    if sync_playwright is None:
        logger.error(
            "Playwright is not installed in the active interpreter.\n"
            "Please run with: uv run --project backend python scripts/visual_responsive_check.py"
        )
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)
    captured_files: List[Path] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        for route in routes:
            clean_route = route.strip("/")
            route_slug = clean_route.replace("/", "_") if clean_route else "home"
            target_url = f"{base_url.rstrip('/')}/{clean_route}" if clean_route else base_url.rstrip("/")

            logger.info("Inspecting route: %s -> %s", route, target_url)

            for vp_name, width, height in viewports:
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    color_scheme="dark" if dark_mode else "light",
                    device_scale_factor=2,  # Retina crisp quality
                )
                page = context.new_page()

                try:
                    logger.info("  Loading %s (%dx%d)...", vp_name, width, height)
                    page.goto(target_url, wait_until="domcontentloaded", timeout=15000)

                    # Allow animations / state render settling
                    page.wait_for_timeout(wait_time_ms)

                    # Ensure dark class toggle if requested and app supports dark class
                    if dark_mode:
                        page.evaluate("() => document.documentElement.classList.add('dark')")
                        page.wait_for_timeout(200)

                    mode_tag = "dark" if dark_mode else "light"
                    filename = f"{route_slug}_{vp_name}_{mode_tag}.png"
                    file_path = output_dir / filename

                    page.screenshot(path=str(file_path), full_page=full_page)
                    logger.info("  Saved snapshot: %s", file_path)
                    captured_files.append(file_path)

                except Exception as err:
                    logger.error("  Failed capturing %s for %s: %s", vp_name, target_url, err)
                finally:
                    context.close()

        browser.close()

    return captured_files


def main():
    parser = argparse.ArgumentParser(description="Capture responsive UI screenshots with Playwright")
    parser.add_argument(
        "--base-url",
        default="http://localhost:5173",
        help="Base URL of frontend dev server (default: http://localhost:5173)",
    )
    parser.add_argument(
        "--routes",
        nargs="+",
        default=["", "manga/1", "panel-words-detector"],
        help="Routes to inspect (e.g. '' 'panel-words-detector')",
    )
    parser.add_argument(
        "--output-dir",
        default="frontend/visual-snapshots",
        help="Output directory for captured PNGs",
    )
    parser.add_argument(
        "--dark",
        action="store_true",
        help="Capture in dark mode theme",
    )
    parser.add_argument(
        "--no-full-page",
        action="store_true",
        help="Capture above-the-fold viewport only instead of full scrollable page",
    )
    parser.add_argument(
        "--wait",
        type=int,
        default=1500,
        help="Wait time in ms after networkidle before screenshot (default: 1500)",
    )

    args = parser.parse_args()
    out_dir = Path(args.output_dir)

    logger.info("Starting Visual Responsive Inspection on %s", args.base_url)
    files = capture_responsive_snapshots(
        base_url=args.base_url,
        routes=args.routes,
        output_dir=out_dir,
        viewports=DEFAULT_VIEWPORTS,
        full_page=not args.no_full_page,
        dark_mode=args.dark,
        wait_time_ms=args.wait,
    )
    logger.info("Successfully captured %d snapshots into %s", len(files), out_dir)


if __name__ == "__main__":
    main()
