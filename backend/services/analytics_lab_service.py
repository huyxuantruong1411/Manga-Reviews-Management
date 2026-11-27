"""Read-only allow-listed Arrow IPC release delivery service for Manga Analytics Lab."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from backend.config import settings

REPO_ROOT = Path(__file__).resolve().parents[2]
RELEASE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
DATASET_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


class AnalyticsLabError(Exception):
    """Base error for Analytics Lab delivery."""


class AnalyticsLabNotFoundError(AnalyticsLabError):
    """Raised when active release, manifest, or dataset is unavailable."""


class AnalyticsLabForbiddenError(AnalyticsLabError):
    """Raised on path traversal, symlink escape, or disabled/unlisted artifact."""


class AnalyticsLabInvalidInputError(AnalyticsLabError):
    """Raised on malformed release_id or dataset_name."""


class AnalyticsLabService:
    """Strictly read-only delivery of published Arrow IPC stream artifacts."""

    def get_analytics_home(self) -> Path:
        raw_home = os.environ.get("ANALYTICS_HOME") or settings.analytics_home
        candidate = Path(raw_home)
        if not candidate.is_absolute():
            candidate = (REPO_ROOT / candidate).resolve()
        else:
            candidate = candidate.resolve()
        return candidate

    def get_releases_root(self) -> Path:
        return (self.get_analytics_home() / "releases").resolve()

    def _ensure_safe_path(self, base: Path, target: Path) -> Path:
        if target.is_symlink():
            raise AnalyticsLabForbiddenError("Symlink targets are disallowed in Analytics Lab releases.")
        resolved = target.resolve()
        if not resolved.is_relative_to(base):
            raise AnalyticsLabForbiddenError("Path traversal outside releases root is forbidden.")
        # Check intermediate components between base and resolved for symlinks
        rel_parts = resolved.relative_to(base).parts
        cur = base
        for part in rel_parts:
            cur = cur / part
            if cur.is_symlink():
                raise AnalyticsLabForbiddenError("Symlink component detected in release path.")
        return resolved

    def _validate_release_id(self, release_id: str) -> str:
        if not RELEASE_ID_RE.match(release_id):
            raise AnalyticsLabInvalidInputError("Invalid release_id format.")
        return release_id

    def _validate_dataset_name(self, dataset_name: str) -> str:
        if not DATASET_NAME_RE.match(dataset_name):
            raise AnalyticsLabInvalidInputError("Invalid dataset_name format.")
        return dataset_name

    def get_active_release_pointer(self) -> Dict[str, Any]:
        releases_root = self.get_releases_root()
        pointer_path = releases_root / "current_release.json"
        if not pointer_path.exists():
            raise AnalyticsLabNotFoundError("No active Analytics Lab release published yet.")
        self._ensure_safe_path(releases_root, pointer_path)
        data = json.loads(pointer_path.read_text(encoding="utf-8"))
        rel_id = data.get("release_id")
        if not isinstance(rel_id, str) or not RELEASE_ID_RE.match(rel_id):
            raise AnalyticsLabNotFoundError("Active release pointer is invalid.")
        return data

    def get_manifest(self, release_id: Optional[str] = None) -> Dict[str, Any]:
        releases_root = self.get_releases_root()
        if not releases_root.exists():
            raise AnalyticsLabNotFoundError("Analytics Lab releases directory does not exist.")

        if release_id is None:
            pointer = self.get_active_release_pointer()
            target_id = pointer["release_id"]
        else:
            target_id = self._validate_release_id(release_id)

        release_dir = self._ensure_safe_path(releases_root, releases_root / target_id)
        if not release_dir.is_dir():
            raise AnalyticsLabNotFoundError(f"Release '{target_id}' not found.")

        manifest_path = self._ensure_safe_path(release_dir, release_dir / "manifest.json")
        if not manifest_path.is_file():
            raise AnalyticsLabNotFoundError(f"Manifest missing for release '{target_id}'.")

        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("release_id") != target_id:
            raise AnalyticsLabForbiddenError("Manifest release_id mismatch.")
        return manifest

    def resolve_dataset_arrow_file(self, release_id: str, dataset_name: str) -> Tuple[Path, Dict[str, Any]]:
        clean_release_id = self._validate_release_id(release_id)
        clean_dataset_name = self._validate_dataset_name(dataset_name)

        manifest = self.get_manifest(clean_release_id)
        datasets = manifest.get("datasets") or {}
        if clean_dataset_name not in datasets:
            raise AnalyticsLabNotFoundError(
                f"Dataset '{clean_dataset_name}' is not declared in release '{clean_release_id}'."
            )

        ds_meta = datasets[clean_dataset_name]
        if not ds_meta.get("enabled", False):
            raise AnalyticsLabForbiddenError(f"Dataset '{clean_dataset_name}' is disabled in this release.")

        rel_path = ds_meta.get("relative_path")
        if not isinstance(rel_path, str) or not rel_path.startswith("arrow/") or not rel_path.endswith(".arrow"):
            raise AnalyticsLabForbiddenError("Invalid dataset relative_path in manifest.")

        releases_root = self.get_releases_root()
        release_dir = self._ensure_safe_path(releases_root, releases_root / clean_release_id)
        arrow_path = self._ensure_safe_path(release_dir, release_dir / rel_path)
        if not arrow_path.is_file():
            raise AnalyticsLabNotFoundError(f"Arrow artifact missing for dataset '{clean_dataset_name}'.")

        return arrow_path, ds_meta

    def get_health(self) -> Dict[str, Any]:
        try:
            manifest = self.get_manifest()
            enabled_count = sum(1 for v in (manifest.get("datasets") or {}).values() if v.get("enabled"))
            return {
                "status": "ready",
                "active_release_id": manifest["release_id"],
                "snapshot_date": manifest.get("snapshot_date"),
                "enabled_datasets": enabled_count,
            }
        except AnalyticsLabNotFoundError:
            return {
                "status": "no_release_published",
                "active_release_id": None,
                "snapshot_date": None,
                "enabled_datasets": 0,
            }


analytics_lab_service = AnalyticsLabService()
