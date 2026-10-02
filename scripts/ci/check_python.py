#!/usr/bin/env python3
"""
CI helper script to find all git-tracked Python files and run Ruff checks/formatting.
Avoids shell expansion issues, handles spaces in paths, and excludes untracked/ignored files.
"""

import argparse
import subprocess
import sys
from pathlib import Path


def get_tracked_python_files(repo_root: Path) -> list[str]:
    """Retrieve all git-tracked .py files."""
    try:
        result = subprocess.run(
            ["git", "ls-files", "-z", "*.py"],
            cwd=str(repo_root),
            capture_output=True,
            check=True,
        )
        raw_files = result.stdout.split(b"\0")
        files = [f.decode("utf-8") for f in raw_files if f and (repo_root / f.decode("utf-8")).is_file()]
        return files
    except Exception as e:
        print(f"Error reading git tracked files: {e}", file=sys.stderr)
        return []


def main():
    parser = argparse.ArgumentParser(description="Run Ruff lint and format checks on tracked Python files.")
    parser.add_argument("--lint-only", action="store_true", help="Run ruff check only")
    parser.add_argument("--format-only", action="store_true", help="Run ruff format only")
    parser.add_argument("--fix", action="store_true", help="Automatically fix issues where possible")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent.parent
    files = get_tracked_python_files(repo_root)

    if not files:
        print("No tracked Python files found.")
        sys.exit(0)

    exit_code = 0

    # 1. Lint check / fix
    if not args.format_only:
        lint_cmd = [sys.executable, "-m", "ruff", "check"]
        if args.fix:
            lint_cmd.append("--fix")
        lint_cmd.extend(files)

        print(f"Running: ruff check on {len(files)} files...")
        res = subprocess.run(lint_cmd, cwd=str(repo_root))
        if res.returncode != 0:
            exit_code = res.returncode

    # 2. Format check / apply
    if not args.lint_only:
        fmt_cmd = [sys.executable, "-m", "ruff", "format"]
        if not args.fix:
            fmt_cmd.append("--check")
        fmt_cmd.extend(files)

        print(f"Running: ruff format on {len(files)} files...")
        res = subprocess.run(fmt_cmd, cwd=str(repo_root))
        if res.returncode != 0 and exit_code == 0:
            exit_code = res.returncode

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
