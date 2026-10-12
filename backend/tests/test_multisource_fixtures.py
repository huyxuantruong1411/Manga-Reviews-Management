from backend.tests.fixtures.multisource_fixtures import (
    CANDIDATE_NORMALIZATION_CASES,
    COLLISION_FIXTURES,
    ROMI_MISMATCH_FIXTURE,
    SAME_CHAPTER_MULTIPLE_RELEASES_FIXTURE,
    SYNTHETIC_MANIFEST_V2,
    generate_synthetic_catalogue_pages,
)


def test_collision_fixtures_have_distinct_sources():
    md = COLLISION_FIXTURES["mangadex_release"]
    mf = COLLISION_FIXTURES["mangafire_release"]
    assert md["source_id"] == mf["source_id"] == "123"
    assert md["source"] != mf["source"]
    # Compound key (source, source_id) must be unique
    assert (md["source"], md["source_id"]) != (mf["source"], mf["source_id"])


def test_same_chapter_multiple_releases_fixture():
    assert len(SAME_CHAPTER_MULTIPLE_RELEASES_FIXTURE) == 2
    rel1, rel2 = SAME_CHAPTER_MULTIPLE_RELEASES_FIXTURE
    assert rel1["number"] == rel2["number"] == 14
    assert rel1["id"] != rel2["id"]
    assert {rel1["type"], rel2["type"]} == {"official", "unofficial"}


def test_candidate_normalization_cases():
    for case in CANDIDATE_NORMALIZATION_CASES:
        assert "raw" in case
        assert "canonical" in case
        assert "numeric" in case


def test_synthetic_catalogue_generation():
    releases = generate_synthetic_catalogue_pages(total_chapters=31, releases_per_chapter=2)
    assert len(releases) == 62
    unique_numbers = {r["number"] for r in releases}
    assert len(unique_numbers) == 31
    assert set(range(1, 32)) == unique_numbers


def test_romi_mismatch_fixture_invariants():
    m = ROMI_MISMATCH_FIXTURE
    assert m["mangafire"]["chapter_number"] == m["mangadex"]["chapter_number"] == "14"
    assert m["mangafire"]["pages_count"] == 6
    assert m["mangadex"]["pages_count"] == 17
    assert m["mangafire"]["chapter_title"] != m["mangadex"]["chapter_title"]
    assert m["should_auto_merge"] is False
    assert m["verification_status"] == "unverified_mapping"


def test_synthetic_manifest_v2_structure():
    manifest = SYNTHETIC_MANIFEST_V2
    assert manifest["schema_version"] == 2
    assert manifest["page_count"] == len(manifest["pages"]) == 6
    for page in manifest["pages"]:
        assert "page_uid" in page
        assert "page_number" in page
        assert "sha256" in page
        assert "object_key" in page
        assert page["object_key"].startswith(f"chapters/{manifest['manga_id']}/")
