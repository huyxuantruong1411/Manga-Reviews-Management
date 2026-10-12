from unittest.mock import MagicMock

import pytest
from bson import json_util

from scripts.backup_metadata import REPO_ROOT, backup, restore_drill


def test_backup_refuses_repository_destination():
    with pytest.raises(ValueError, match="outside the repository"):
        backup(MagicMock(), REPO_ROOT / "forbidden-backup")


@pytest.mark.parametrize("filename", ["../outside.bson", "collection.bson"])
def test_restore_rejects_path_escape_and_corrupt_hash_before_any_database_access(tmp_path, filename):
    (tmp_path / "collection.bson").write_bytes(b"damaged")
    (tmp_path / "manifest.json").write_text(
        json_util.dumps(
            {
                "version": 1,
                "collections": [{"file": filename, "sha256": "0" * 64}],
            }
        ),
        encoding="utf-8",
    )
    client = MagicMock()
    with pytest.raises(ValueError, match="path/hash"):
        restore_drill(client, tmp_path)
    assert client.mock_calls == []
