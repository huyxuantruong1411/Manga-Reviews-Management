"""scripts/sync_codebase_memory.py – Codebase Memory & CodeGraph Incremental Sync Utility.

Triggered automatically via Git hooks (post-commit) or manually by engineers/agents.
1. Runs incremental `codegraph sync` to update the AST knowledge graph.
2. Updates `.antigravity/codebase-memory.json` with the latest commit metadata,
   preserving architectural decisions, recent modifications, and active context.
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("sync_codebase_memory")

ROOT_DIR = Path(__file__).resolve().parent.parent
MEMORY_FILE = ROOT_DIR / ".antigravity" / "codebase-memory.json"

DEFAULT_ARCHITECTURAL_DECISIONS = [
    {
        "id": "ADR-001",
        "title": "Layered Architecture Guard & Pydantic Validation",
        "summary": (
            "FastAPI routers strictly validate input with Pydantic v2 DTOs and"
            " delegate business logic to Domain Services. Direct DB queries in"
            " controllers are prohibited."
        ),
        "status": "active",
        "updated_at": "2026-10-02T05:00:00Z",
    },
    {
        "id": "ADR-002",
        "title": "Redis Caching Layer & ARQ Background Task Worker",
        "summary": (
            "Redis cache with graceful fallback for manga details and review"
            " aggregation. Heavy RapidOCR and NLP processing offloaded to"
            " asynchronous ARQ worker."
        ),
        "status": "active",
        "updated_at": "2026-10-02T05:30:00Z",
    },
    {
        "id": "ADR-003",
        "title": "Hierarchical Page-First Panel Extraction Audit Reports",
        "summary": (
            "Panel audit reports embed intact raw original page images as"
            " visual baseline followed by corresponding extracted crops,"
            " dialogues, and vocabulary badges."
        ),
        "status": "active",
        "updated_at": "2026-10-02T16:50:00Z",
    },
    {
        "id": "ADR-004",
        "title": "Playwright Visual & Responsive Testing in Monorepo",
        "summary": (
            "Playwright CLI testing across Desktop (1440px) and Mobile (375px)"
            " viewports integrated into frontend with zero horizontal overflow"
            " enforcement."
        ),
        "status": "active",
        "updated_at": "2026-10-02T17:25:00Z",
    },
    {
        "id": "ADR-005",
        "title": ("Automated Incremental CodeGraph Sync & Persistent Codebase Memory"),
        "summary": (
            "Git post-commit hook triggers incremental CodeGraph sync and"
            " updates codebase-memory.json to eliminate context amnesia and"
            " stale AST graphs."
        ),
        "status": "active",
        "updated_at": "2026-10-02T17:35:00Z",
    },
]

DEFAULT_ACTIVE_CONTEXT = (
    "Full-stack Manga Review & Scene Panel OCR Analysis platform with FastAPI"
    " backend, React 19 / TypeScript frontend, MinIO S3 media storage, Redis"
    " caching, ARQ async task worker, and CodeGraph AST code intelligence."
)


def run_command(cmd: list[str], cwd: Path | None = None, timeout: int = 15) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd or ROOT_DIR),
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=True if sys.platform == "win32" else False,
        )
        return proc.returncode, proc.stdout.strip()
    except Exception as e:
        logger.warning(f"Command {' '.join(cmd)} failed: {e}")
        return 1, str(e)


def sync_codegraph() -> bool:
    """Run incremental codegraph sync."""
    code, out = run_command(["codegraph", "sync"])
    if code == 0:
        summary = out.splitlines()[-1] if out else "Success"
        logger.info(f"CodeGraph Sync: {summary}")
        return True
    logger.warning(f"CodeGraph Sync failed: {out}")
    return False


def get_latest_git_commit() -> dict | None:
    """Extract latest Git commit metadata."""
    try:
        commit_hash = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=str(ROOT_DIR), text=True).strip()
        short_hash = commit_hash[:7]
        subject = subprocess.check_output(["git", "log", "-1", "--pretty=%s"], cwd=str(ROOT_DIR), text=True).strip()
        timestamp = subprocess.check_output(["git", "log", "-1", "--pretty=%cI"], cwd=str(ROOT_DIR), text=True).strip()
        author = subprocess.check_output(["git", "log", "-1", "--pretty=%an"], cwd=str(ROOT_DIR), text=True).strip()
        files = (
            subprocess.check_output(
                [
                    "git",
                    "diff-tree",
                    "--no-commit-id",
                    "--name-only",
                    "-r",
                    "HEAD",
                ],
                cwd=str(ROOT_DIR),
                text=True,
            )
            .strip()
            .splitlines()
        )

        return {
            "commit": commit_hash,
            "short_hash": short_hash,
            "subject": subject,
            "author": author,
            "timestamp": timestamp,
            "files_count": len(files),
            "files": files[:25],
        }
    except Exception as e:
        logger.warning(f"Failed to read git metadata: {e}")
        return None


def update_codebase_memory(commit_data: dict | None) -> dict:
    """Update or initialize .antigravity/codebase-memory.json."""
    MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)

    data = {
        "last_synced_commit": "",
        "last_synced_at": "",
        "architectural_decisions": DEFAULT_ARCHITECTURAL_DECISIONS,
        "recent_modifications": [],
        "active_context": DEFAULT_ACTIVE_CONTEXT,
    }

    if MEMORY_FILE.exists():
        try:
            with open(MEMORY_FILE, "r", encoding="utf-8") as f:
                existing = json.load(f)
                if isinstance(existing, dict):
                    data.update(existing)
                    if not data.get("architectural_decisions"):
                        data["architectural_decisions"] = DEFAULT_ARCHITECTURAL_DECISIONS
                    if not data.get("active_context"):
                        data["active_context"] = DEFAULT_ACTIVE_CONTEXT
        except Exception as e:
            logger.warning(f"Could not parse existing codebase-memory.json: {e}")

    now_iso = datetime.now(timezone.utc).isoformat()
    data["last_synced_at"] = now_iso

    if commit_data:
        data["last_synced_commit"] = commit_data["commit"]
        recent = data.get("recent_modifications", [])
        if not any(item.get("commit") == commit_data["commit"] for item in recent):
            recent.insert(0, commit_data)
        data["recent_modifications"] = recent[:15]

    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    try:
        rel_path = MEMORY_FILE.relative_to(ROOT_DIR)
    except ValueError:
        rel_path = MEMORY_FILE

    logger.info(f"Codebase Memory updated at {rel_path}")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync CodeGraph and Codebase Memory")
    parser.add_argument(
        "--bg",
        action="store_true",
        help="Spawn a background detached process and exit immediately",
    )
    args = parser.parse_args()

    if args.bg and sys.platform == "win32":
        DETACHED_PROCESS = 0x00000008
        subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve())],
            cwd=str(ROOT_DIR),
            creationflags=DETACHED_PROCESS,
            close_fds=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return 0

    sync_codegraph()
    commit_data = get_latest_git_commit()
    update_codebase_memory(commit_data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
