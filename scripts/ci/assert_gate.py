#!/usr/bin/env python3
"""
CI Gate Assert Helper:
Validates that all required GitHub Actions jobs succeeded and that any skipped jobs
were legitimately skipped based on the changes classification.
Fails with non-zero exit code if any required job failed, was cancelled, or was unexpectedly skipped.

Reads from environment variables CI_NEEDS_JSON and CI_CHANGES_JSON (or CLI arguments).
"""

import argparse
import json
import os
import sys


def get_inputs():
    parser = argparse.ArgumentParser(description="Validate CI job completion matrix")
    parser.add_argument(
        "--needs-json",
        default=os.environ.get("CI_NEEDS_JSON", ""),
        help="JSON string of GitHub Actions 'needs' context",
    )
    parser.add_argument(
        "--changes-json",
        default=os.environ.get("CI_CHANGES_JSON", ""),
        help="JSON string of 'needs.changes.outputs' classification",
    )
    args = parser.parse_args()

    if not args.needs_json or not args.changes_json:
        print(
            "ERROR: Missing needs-json or changes-json (via CLI or CI_NEEDS_JSON / CI_CHANGES_JSON env vars).",
            file=sys.stderr,
        )
        sys.exit(1)

    return args.needs_json, args.changes_json


def main():
    needs_raw, changes_raw = get_inputs()

    try:
        needs = json.loads(needs_raw)
    except Exception as e:
        print(f"CRITICAL: Failed to parse needs JSON: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        changes = json.loads(changes_raw)
    except Exception as e:
        print(f"CRITICAL: Failed to parse changes JSON: {e}", file=sys.stderr)
        sys.exit(1)

    print("=" * 60)
    print("CI Gate: Aggregate Status Evaluation")
    print("=" * 60)

    # Classification flags
    backend_required = str(changes.get("backend_required", "false")).lower() == "true"
    frontend_required = str(changes.get("frontend_required", "false")).lower() == "true"
    ui_required = str(changes.get("ui_required", "false")).lower() == "true"

    print("Path filters classification:")
    print(f"  - backend_required:  {backend_required}")
    print(f"  - frontend_required: {frontend_required}")
    print(f"  - ui_required:       {ui_required}")
    print("-" * 60)

    # Job expectations: (job_name, is_unconditional, is_required)
    job_specs = [
        ("changes", True, True),
        ("secrets", True, True),
        ("docs", True, True),
        ("backend-quality", False, backend_required),
        ("backend-tests", False, backend_required),
        ("frontend", False, frontend_required),
        ("ui-smoke", False, ui_required),
    ]

    has_error = False

    for job_name, is_unconditional, is_required in job_specs:
        job_data = needs.get(job_name)
        if not job_data:
            print(f"[FAIL] {job_name:18} : MISSING from needs context")
            has_error = True
            continue

        result = job_data.get("result", "unknown")

        if is_required:
            if result == "success":
                print(f"[PASS] {job_name:18} : SUCCESS (required)")
            else:
                print(
                    f"[FAIL] {job_name:18} : {result.upper()} (expected SUCCESS, required)"
                )
                has_error = True
        else:
            if result in ("skipped", "success"):
                print(f"[PASS] {job_name:18} : {result.upper()} (optional/not-required)")
            else:
                print(
                    f"[FAIL] {job_name:18} : {result.upper()} (unexpected failure/cancellation)"
                )
                has_error = True

    print("=" * 60)
    if has_error:
        print("GATE RESULT: FAILED. One or more required checks did not pass.")
        print("=" * 60)
        sys.exit(1)
    else:
        print("GATE RESULT: PASSED. All required CI checks completed successfully.")
        print("=" * 60)
        sys.exit(0)


if __name__ == "__main__":
    main()
