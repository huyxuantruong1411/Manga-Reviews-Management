"""Behavioral tests for runner execution pipeline, cancellation, and artifact generation."""

import os
import sys
import tempfile

from PIL import Image

# Ensure translator-runtime is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from adapter.runner import run_pipeline
from protocol import InputEnvelope, InputSource, ProfileSnapshot


def test_runner_executes_pipeline_and_emits_valid_manifest():
    with tempfile.TemporaryDirectory() as tmpdir:
        input_file = os.path.join(tmpdir, "test_page.png")
        # Create a synthetic image
        img = Image.new("RGB", (400, 600), color=(255, 255, 255))
        img.save(input_file)

        workdir = os.path.join(tmpdir, "workdir_1")

        envelope = InputEnvelope(
            job_id="job_001",
            page_identity="p_uid_123",
            attempt_id="att_1",
            fencing_token=1,
            input=InputSource(local_path=input_file, sha256="dummy_sha"),
            workdir=workdir,
            profile_snapshot=ProfileSnapshot(
                schema_version=1,
                config_hash="cfg_hash_test",
                effective_config={},
            ),
            target_language="vi",
            source_language="ja",
        )

        manifest = run_pipeline(envelope)

        assert manifest.success is True
        assert manifest.job_id == "job_001"
        assert manifest.page_identity == "p_uid_123"
        assert manifest.width == 400
        assert manifest.height == 600
        assert os.path.exists(manifest.output_image_path)
        assert os.path.exists(manifest.clean_image_path)
        assert len(manifest.output_sha256) == 64
        assert len(manifest.regions) > 0


def test_runner_handles_missing_input_file_gracefully():
    with tempfile.TemporaryDirectory() as tmpdir:
        workdir = os.path.join(tmpdir, "workdir_2")
        envelope = InputEnvelope(
            job_id="job_002",
            page_identity="p_uid_456",
            attempt_id="att_1",
            fencing_token=1,
            input=InputSource(local_path=os.path.join(tmpdir, "non_existent.png"), sha256="dummy_sha"),
            workdir=workdir,
            profile_snapshot=ProfileSnapshot(schema_version=1, config_hash="hash"),
        )

        manifest = run_pipeline(envelope)
        assert manifest.success is False
        assert manifest.error_code == "INPUT_NOT_FOUND"


def test_runner_respects_cancellation_token():
    with tempfile.TemporaryDirectory() as tmpdir:
        input_file = os.path.join(tmpdir, "test_page.png")
        img = Image.new("RGB", (100, 100), color=(0, 0, 0))
        img.save(input_file)

        workdir = os.path.join(tmpdir, "workdir_cancelled")
        os.makedirs(workdir, exist_ok=True)
        # Create cancellation token sentinel
        with open(os.path.join(workdir, "cancel.token"), "w") as f:
            f.write("cancelled")

        envelope = InputEnvelope(
            job_id="job_003",
            page_identity="p_uid_789",
            attempt_id="att_1",
            fencing_token=1,
            input=InputSource(local_path=input_file, sha256="dummy_sha"),
            workdir=workdir,
            profile_snapshot=ProfileSnapshot(schema_version=1, config_hash="hash"),
        )

        manifest = run_pipeline(envelope)
        assert manifest.success is False
        assert manifest.error_code == "CANCELLED"
