"""Log pruning utility to clean up archived daily NDJSON log files."""

from __future__ import annotations

import argparse
import re
from datetime import datetime, timezone
from pathlib import Path

_LOG_FILE_PATTERN = re.compile(r"^([a-zA-Z0-9_\-]+)-(\d{4}-\d{2}-\d{2})\.ndjson$")


def prune_logs(
    log_dir: Path | str = "logs",
    days: int = 7,
    dry_run: bool = False,
) -> list[Path]:
    """Finds and removes .ndjson log files older than *days* days.

    Never removes files stamped with today's UTC date.
    Returns the list of files removed (or that would be removed in dry_run).
    """
    directory = Path(log_dir)
    if not directory.exists():
        return []

    today = datetime.now(timezone.utc).date()
    target_files: list[Path] = []

    for file_path in directory.glob("*.ndjson"):
        match = _LOG_FILE_PATTERN.match(file_path.name)
        if not match:
            continue

        date_str = match.group(2)
        try:
            file_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            continue

        # Never prune today's file
        if file_date >= today:
            continue

        age_days = (today - file_date).days
        if age_days > days:
            target_files.append(file_path)
            if dry_run:
                print(f"[DRY-RUN] Would remove: {file_path.name} (age: {age_days} days)")
            else:
                try:
                    file_path.unlink()
                    print(f"Removed: {file_path.name} (age: {age_days} days)")
                except OSError as e:
                    print(f"Error removing {file_path.name}: {e}")

    return target_files


def main() -> None:
    parser = argparse.ArgumentParser(description="Prune old daily NDJSON log files")
    parser.add_argument("--dir", default="logs", help="Directory containing .ndjson log files")
    parser.add_argument("--days", type=int, default=7, help="Retention period in days (default: 7)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate pruning without deleting files")
    args = parser.parse_args()

    pruned = prune_logs(log_dir=args.dir, days=args.days, dry_run=args.dry_run)
    print(f"Total files pruned: {len(pruned)}")


if __name__ == "__main__":
    main()
