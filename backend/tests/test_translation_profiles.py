"""TDD tests for Translation Profile management, immutable revisions, diffing, and secret redaction.

Tests verify:
- Creating a profile creates a durable profile record and an immutable revision 1.
- Updating a profile creates revision N+1 and updates active_revision atomically.
- Conflict detection (expected_revision mismatch) prevents lost updates.
- Revision diffing calculates exact parameter changes.
- Exporting profile sanitizes sensitive environment references and secret fields.
- Default profile is automatically initialized if none exists.
"""

import pytest

from backend.models.translation import (
    TranslationProfileCreate,
    compute_config_hash,
)
from backend.services.translation.profiles import translation_profile_service


@pytest.mark.anyio
async def test_create_profile_creates_immutable_first_revision(monkeypatch):
    """Creating a profile must persist profile document and revision 1 with canonical hash."""
    fake_profiles = {}
    fake_revisions = []

    class MockProfilesCol:
        async def insert_one(self, doc):
            fake_profiles[doc["profile_id"]] = doc
            return True

        async def find_one(self, query):
            pid = query.get("profile_id")
            return fake_profiles.get(pid)

    class MockRevisionsCol:
        async def insert_one(self, doc):
            fake_revisions.append(doc)
            return True

        def find(self, query):
            pid = query.get("profile_id")
            matches = [r for r in fake_revisions if r.get("profile_id") == pid]

            class Cursor:
                async def to_list(self, length=None):
                    return matches

            return Cursor()

    class MockDB:
        def __getitem__(self, item):
            if item == "translation_profiles":
                return MockProfilesCol()
            if item == "translation_profile_revisions":
                return MockRevisionsCol()
            raise KeyError(item)

    monkeypatch.setattr("backend.database.connection.get_db", lambda: MockDB())

    req = TranslationProfileCreate(
        name="Manga Quality Profile",
        target_language="vi",
        source_language="ja",
        effective_config={
            "detector": "default",
            "ocr": "manga_ocr",
            "translator": "gemini",
            "render_font": "WildWords",
        },
    )

    created = await translation_profile_service.create_profile(req)
    assert created["name"] == "Manga Quality Profile"
    assert created["active_revision"] == 1
    assert "profile_id" in created
    assert len(created["config_hash"]) == 64

    # Verify revision 1 was saved
    assert len(fake_revisions) == 1
    rev1 = fake_revisions[0]
    assert rev1["revision"] == 1
    assert rev1["profile_id"] == created["profile_id"]
    assert rev1["config_hash"] == created["config_hash"]
    assert rev1["effective_config"]["render_font"] == "WildWords"


@pytest.mark.anyio
async def test_update_profile_creates_new_revision(monkeypatch):
    """Updating a profile creates revision 2 and updates active_revision."""
    profile_id = "p-123"
    initial_config = {"detector": "default", "font_size": 16}
    initial_hash = compute_config_hash(initial_config)

    fake_profiles = {
        profile_id: {
            "profile_id": profile_id,
            "name": "Standard Profile",
            "target_language": "vi",
            "source_language": "auto",
            "active_revision": 1,
            "config_hash": initial_hash,
            "effective_config": initial_config,
        }
    }
    fake_revisions = [
        {
            "profile_id": profile_id,
            "revision": 1,
            "config_hash": initial_hash,
            "effective_config": initial_config,
        }
    ]

    class MockProfilesCol:
        async def find_one(self, query):
            return fake_profiles.get(query.get("profile_id"))

        async def update_one(self, query, update):
            pid = query.get("profile_id")
            if pid in fake_profiles:
                fake_profiles[pid].update(update.get("$set", {}))
                return True
            return False

    class MockRevisionsCol:
        async def insert_one(self, doc):
            fake_revisions.append(doc)
            return True

        async def find_one(self, query):
            pid = query.get("profile_id")
            rev = query.get("revision")
            for r in fake_revisions:
                if r.get("profile_id") == pid and r.get("revision") == rev:
                    return r
            return None

    class MockDB:
        def __getitem__(self, item):
            if item == "translation_profiles":
                return MockProfilesCol()
            if item == "translation_profile_revisions":
                return MockRevisionsCol()
            raise KeyError(item)

    monkeypatch.setattr("backend.database.connection.get_db", lambda: MockDB())

    updated = await translation_profile_service.update_profile(
        profile_id=profile_id,
        update_data={"effective_config": {"detector": "default", "font_size": 20}},
        expected_revision=1,
    )

    assert updated["active_revision"] == 2
    assert updated["effective_config"]["font_size"] == 20
    assert updated["config_hash"] != initial_hash

    # Check revision 2 in store
    assert len(fake_revisions) == 2
    assert fake_revisions[1]["revision"] == 2
    assert fake_revisions[1]["effective_config"]["font_size"] == 20


@pytest.mark.anyio
async def test_update_profile_conflict_error_on_stale_expected_revision(monkeypatch):
    """Passing an outdated expected_revision raises ValueError (409 conflict)."""
    profile_id = "p-conflict"
    fake_profiles = {
        profile_id: {
            "profile_id": profile_id,
            "name": "Standard Profile",
            "active_revision": 2,
            "config_hash": "hash-rev-2",
            "effective_config": {"font_size": 20},
        }
    }

    class MockProfilesCol:
        async def find_one(self, query):
            return fake_profiles.get(query.get("profile_id"))

    class MockDB:
        def __getitem__(self, item):
            return MockProfilesCol()

    monkeypatch.setattr("backend.database.connection.get_db", lambda: MockDB())

    with pytest.raises(ValueError, match="Revision conflict"):
        await translation_profile_service.update_profile(
            profile_id=profile_id,
            update_data={"effective_config": {"font_size": 24}},
            expected_revision=1,  # Stale! Already at 2
        )


@pytest.mark.anyio
async def test_diff_profile_revisions(monkeypatch):
    """Diffing two revisions identifies added, changed, and removed keys."""
    profile_id = "p-diff"
    rev1 = {
        "profile_id": profile_id,
        "revision": 1,
        "effective_config": {"font_size": 16, "model": "gemini-1.5", "old_key": "val"},
    }
    rev2 = {
        "profile_id": profile_id,
        "revision": 2,
        "effective_config": {"font_size": 18, "model": "gemini-2.5", "new_key": "added"},
    }

    class MockRevisionsCol:
        async def find_one(self, query):
            rev = query.get("revision")
            if rev == 1:
                return rev1
            if rev == 2:
                return rev2
            return None

    class MockDB:
        def __getitem__(self, item):
            return MockRevisionsCol()

    monkeypatch.setattr("backend.database.connection.get_db", lambda: MockDB())

    diff = await translation_profile_service.diff_revisions(profile_id, 1, 2)
    assert "old_key" in diff["removed"]
    assert "new_key" in diff["added"]
    assert diff["modified"]["font_size"] == {"from": 16, "to": 18}
    assert diff["modified"]["model"] == {"from": "gemini-1.5", "to": "gemini-2.5"}


def test_export_profile_redacts_secrets_and_local_paths():
    """Exporting a profile config redacts API keys, secret credentials, and server paths."""
    raw_config = {
        "target_lang": "vi",
        "api_key": "AIzaSySecretToken12345",
        "gemini_api_key": "sk-secret-key",
        "bearer_token": "secret_bearer",
        "client_secret": "my-secret",
        "local_model_path": "C:\\Users\\Admin\\AppData\\models\\weights.pt",
        "server_workdir": "/var/app/manga/workdir",
        "max_tokens": 1024,
    }

    sanitized = translation_profile_service.sanitize_config_for_export(raw_config)
    assert "api_key" not in sanitized or sanitized["api_key"] == "[REDACTED]"
    assert sanitized.get("gemini_api_key") == "[REDACTED]"
    assert sanitized.get("bearer_token") == "[REDACTED]"
    assert sanitized.get("client_secret") == "[REDACTED]"
    assert "local_model_path" not in sanitized
    assert "server_workdir" not in sanitized
    assert sanitized["max_tokens"] == 1024
