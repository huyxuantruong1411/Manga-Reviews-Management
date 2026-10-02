"""scripts/install_hooks.py – Installs local Git hooks for CodeGraph sync & memory preservation."""

from __future__ import annotations

import os
import stat
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
HOOKS_DIR = ROOT_DIR / ".git" / "hooks"
POST_COMMIT_HOOK = HOOKS_DIR / "post-commit"

HOOK_CONTENT = """#!/bin/sh
# Manga-Reviews-Management: Post-Commit Hook
# Triggers incremental CodeGraph sync and updates persistent codebase memory.
# Executes non-blocking (<1s) so git commit flow is never impeded.

if command -v python >/dev/null 2>&1; then
    python scripts/sync_codebase_memory.py --bg >/dev/null 2>&1 &
elif command -v python3 >/dev/null 2>&1; then
    python3 scripts/sync_codebase_memory.py --bg >/dev/null 2>&1 &
fi

exit 0
"""


def install_hooks() -> int:
    if not HOOKS_DIR.exists():
        print(f"[ERROR] .git/hooks directory not found at {HOOKS_DIR}. Is this a Git repo?")
        return 1

    POST_COMMIT_HOOK.write_text(HOOK_CONTENT, encoding="utf-8")

    # Make executable on Unix/Mac
    if sys.platform != "win32":
        st = os.stat(POST_COMMIT_HOOK)
        os.chmod(POST_COMMIT_HOOK, st.st_mode | stat.S_IEXEC)

    print(f"[OK] Post-commit hook installed successfully at {POST_COMMIT_HOOK}")
    return 0


if __name__ == "__main__":
    sys.exit(install_hooks())
