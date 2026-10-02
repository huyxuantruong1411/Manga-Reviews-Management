"""
benchmark_layout_models.py - Benchmarks layout analyzers and compares V2 vs V3 models.
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime

import numpy as np

# Ensure backend can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.services.vision.layout.opencv_fallback import OpenCVFallbackLayoutAnalyzer
from backend.services.vision.layout.semantic_layout import SemanticLayoutAnalyzer
from backend.services.vision.types import PageAnalysisContext


def run_benchmark():
    parser = argparse.ArgumentParser(description="Benchmark Manga Layout Analyzers")
    parser.add_argument("--image", type=str, help="Path to a test image")
    parser.add_argument("--output_dir", type=str, default="artifacts/benchmarks/layout")
    args = parser.parse_args()

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_dir = os.path.join(args.output_dir, timestamp)
    os.makedirs(out_dir, exist_ok=True)

    print(f"Starting Manga Layout Benchmark at {timestamp}...")
    models = {
        "v2_opencv": OpenCVFallbackLayoutAnalyzer(),
        "v3_semantic": SemanticLayoutAnalyzer(),
    }

    # Dummy test image if none provided
    if args.image and os.path.exists(args.image):
        import cv2

        img = cv2.imread(args.image)
    else:
        # Create a synthetic 1200x1800 page with 4 panels
        img = np.ones((1800, 1200, 3), dtype=np.uint8) * 255
        import cv2

        # Draw 4 panels
        cv2.rectangle(img, (60, 60), (570, 850), (0, 0, 0), 4)
        cv2.rectangle(img, (630, 60), (1140, 850), (0, 0, 0), 4)
        cv2.rectangle(img, (60, 910), (570, 1740), (0, 0, 0), 4)
        cv2.rectangle(img, (630, 910), (1140, 1740), (0, 0, 0), 4)

    ctx = PageAnalysisContext(
        manga_id="bench_manga",
        chapter_id="bench_chap",
        page_number=1,
        page_hash="bench_hash",
        image_width=img.shape[1],
        image_height=img.shape[0],
    )

    results = {}
    for name, analyzer in models.items():
        t0 = time.perf_counter()
        regions = analyzer.analyze_layout(img, ctx)
        elapsed_ms = (time.perf_counter() - t0) * 1000

        results[name] = {
            "elapsed_ms": round(elapsed_ms, 2),
            "region_count": len(regions),
            "regions": [r.model_dump() for r in regions],
        }
        print(f"[{name}] {len(regions)} regions detected in {elapsed_ms:.2f} ms")

    summary_file = os.path.join(out_dir, "metrics.json")
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"Benchmark completed successfully. Report saved to: {summary_file}")


if __name__ == "__main__":
    run_benchmark()
