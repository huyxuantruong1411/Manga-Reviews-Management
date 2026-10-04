"""Behavioral tests for translator runtime communication protocol."""

import json
import os
import sys

# Ensure translator runtime directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from protocol import (
    InputEnvelope,
    InputSource,
    OutputManifest,
    ProfileSnapshot,
    RegionTranscript,
    StageEvent,
)


def test_input_envelope_serialization_and_redaction():
    envelope = InputEnvelope(
        job_id="job_test_123",
        page_identity="page_uid_abc",
        attempt_id="att_1",
        fencing_token=1,
        input=InputSource(local_path="D:/tmp/page_001.png", sha256="abcdef123456"),
        workdir="D:/tmp/workdir_123",
        profile_snapshot=ProfileSnapshot(
            schema_version=1,
            config_hash="conf_hash_999",
            effective_config={"detector": "default", "temperature": 0.2},
        ),
        target_language="vi",
        credentials={"gemini_api_key": "AIzaSySecretKeyExample12345"},
    )

    # When redacting secrets
    redacted_dict = envelope.to_dict(redact_secrets=True)
    assert redacted_dict["credentials"]["gemini_api_key"] == "***REDACTED***"

    # When preserving secrets for worker pipe
    full_dict = envelope.to_dict(redact_secrets=False)
    assert full_dict["credentials"]["gemini_api_key"] == "AIzaSySecretKeyExample12345"

    # Round trip deserialization
    deserialized = InputEnvelope.from_dict(full_dict)
    assert deserialized.job_id == "job_test_123"
    assert deserialized.page_identity == "page_uid_abc"
    assert deserialized.credentials["gemini_api_key"] == "AIzaSySecretKeyExample12345"


def test_stage_event_emission():
    event = StageEvent(
        event_type="stage_progress",
        stage="ocr",
        progress_pct=45.5,
        message="Detected 4 text blocks",
        elapsed_ms=120.5,
        metadata={"blocks_found": 4},
    )

    raw_json = event.to_json()
    parsed = json.loads(raw_json)
    assert parsed["event_type"] == "stage_progress"
    assert parsed["stage"] == "ocr"
    assert parsed["progress_pct"] == 45.5
    assert parsed["metadata"]["blocks_found"] == 4


def test_output_manifest_validation():
    region = RegionTranscript(
        region_id="reg_1",
        bounding_box={"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.15},
        reading_order=1,
        source_text="こんにちは",
        translated_text="Xin chào",
        confidence=0.98,
        quality_warning=None,
    )

    manifest = OutputManifest(
        job_id="job_test_123",
        page_identity="page_uid_abc",
        attempt_id="att_1",
        operation_kind="translate",
        success=True,
        output_image_path="D:/tmp/workdir_123/translated.png",
        clean_image_path="D:/tmp/workdir_123/cleaned.png",
        output_sha256="fedcba654321",
        width=1200,
        height=1800,
        detected_regions_count=1,
        translated_regions_count=1,
        regions=[region],
        warnings=[],
        timings_ms={"detection": 45.0, "ocr": 80.0, "translation": 300.0, "render": 60.0},
    )

    raw_json = manifest.to_json()
    parsed = json.loads(raw_json)
    assert parsed["success"] is True
    assert parsed["detected_regions_count"] == 1
    assert len(parsed["regions"]) == 1
    assert parsed["regions"][0]["translated_text"] == "Xin chào"
    assert parsed["timings_ms"]["translation"] == 300.0
