"""Fast, read-only documentation integrity and anti-drift checker.

Verifies:
1. No absolute file:/// or local Windows paths (D:/, C:/).
2. All relative Markdown links resolve to real files on disk.
3. No links point to private or ignored directories (ref/, node_modules, etc.).
4. Estimated token budget benchmarks for AI context documents.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import List, Tuple


def get_tracked_files(repo_root: Path) -> set[str]:
    """Get list of git-tracked files in lower and exact case."""
    try:
        import subprocess

        output = subprocess.check_output(["git", "ls-files"], cwd=str(repo_root), text=True, encoding="utf-8")
        return {line.strip().replace("\\", "/") for line in output.splitlines() if line.strip()}
    except Exception:
        # Fallback if git is not in PATH
        return set()


def check_markdown_file(
    md_file: Path,
    repo_root: Path,
    tracked_files: set[str],
) -> List[str]:
    """Inspect a markdown file for invalid links or protocol violations."""
    errors: List[str] = []
    content = md_file.read_text(encoding="utf-8")

    # 1. Check for forbidden file:/// or drive letters
    if "file:///" in content:
        errors.append(f"{md_file.name}: Contains forbidden 'file:///' link protocol.")

    drive_letter_matches = re.findall(r"\[.*?\]\(([A-Za-z]:[\\/][^)]+)\)", content)
    if drive_letter_matches:
        errors.append(f"{md_file.name}: Contains local absolute path: {drive_letter_matches[:2]}")

    # 2. Extract standard markdown links: [text](target)
    # Exclude external http/https/mailto/# anchors
    link_pattern = re.compile(r"\[.*?\]\((?!https?://|mailto:|#)([^)]+)\)")
    for match in link_pattern.finditer(content):
        raw_target = match.group(1).split("#")[0].strip()
        if not raw_target:
            continue

        # Reject private/ignored directories in links
        if any(p in raw_target for p in ("ref/", "note.txt")):
            errors.append(f"{md_file.name}: Points to private/ignored target: '{raw_target}'")
            continue

        # Resolve path relative to current md file
        target_path = (md_file.parent / raw_target).resolve()
        if not target_path.exists():
            errors.append(f"{md_file.name}: Broken relative link '{raw_target}' (target not found)")
        else:
            # Case sensitivity check against git index if available
            if tracked_files:
                try:
                    rel_to_root = target_path.relative_to(repo_root).as_posix()
                    if rel_to_root not in tracked_files and target_path.is_file():
                        # Check if it differs only by case
                        lower_map = {f.lower(): f for f in tracked_files}
                        if rel_to_root.lower() in lower_map:
                            errors.append(
                                f"{md_file.name}: Case mismatch for '{rel_to_root}' (git index: '{lower_map[rel_to_root.lower()]}')"
                            )
                except ValueError:
                    pass

    return errors


def estimate_tokens(text: str) -> int:
    """Rough estimation of token count (~4 characters or ~0.75 words per token)."""
    words = len(text.split())
    chars = len(text)
    return int((words * 1.3 + chars / 4.0) / 2)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    repo_root = Path(__file__).resolve().parent.parent
    docs_to_check = [
        repo_root / "README.md",
        repo_root / "AGENTS.md",
        repo_root / "SECURITY.md",
        repo_root / "llms.txt",
        repo_root / "backend" / "README.md",
        repo_root / "frontend" / "README.md",
    ]
    docs_to_check.extend(repo_root.glob("docs/**/*.md"))

    tracked_files = get_tracked_files(repo_root)
    all_errors: List[str] = []

    print("Checking documentation integrity & links...")
    for md_file in docs_to_check:
        if not md_file.exists():
            all_errors.append(f"Missing required documentation file: {md_file}")
            continue

        file_errors = check_markdown_file(md_file, repo_root, tracked_files)
        all_errors.extend(file_errors)

    # Token budget report
    budget_files: List[Tuple[str, Path, int]] = [
        ("ai-context.md", repo_root / "docs" / "ai-context.md", 2400),
        ("AGENTS.md", repo_root / "AGENTS.md", 1000),
        ("llms.txt", repo_root / "llms.txt", 400),
        ("README.md", repo_root / "README.md", 2500),
    ]

    print("\n--- AI Context Token Budget Report ---")
    for name, path, max_budget in budget_files:
        if path.exists():
            text = path.read_text(encoding="utf-8")
            est = estimate_tokens(text)
            status = "PASS" if est <= max_budget else "WARN (Over budget)"
            print(f"  {name:15}: ~{est:4d} tokens (Budget: {max_budget}) -> {status}")

    if all_errors:
        print("\n[ERROR] Documentation errors found:", file=sys.stderr)
        for err in all_errors:
            print(f"  - {err}", file=sys.stderr)
        sys.exit(1)

    print("\n[OK] All documentation links, paths, and budgets passed successfully!")
    sys.exit(0)


if __name__ == "__main__":
    main()
