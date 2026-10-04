"""Communication protocol models for translator runtime.

Defines the serialized envelope exchanged between the FastAPI worker control
plane and the isolated translation subprocess.
"""

import json
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class NormalizedBoundingBox:
    x: float
    y: float
    width: float
    height: float


@dataclass
class RegionTranscript:
    region_id: str
    bounding_box: Dict[str, float]  # x, y, width, height normalized [0.0, 1.0]
    reading_order: int
    source_text: str
    translated_text: str
    confidence: Optional[float] = None
    quality_warning: Optional[str] = None


@dataclass
class InputSource:
    local_path: str
    sha256: str


@dataclass
class ProfileSnapshot:
    schema_version: int
    config_hash: str
    effective_config: Dict[str, Any] = field(default_factory=dict)


@dataclass
class InputEnvelope:
    job_id: str
    page_identity: str
    attempt_id: str
    fencing_token: int
    input: InputSource
    workdir: str
    profile_snapshot: ProfileSnapshot
    target_language: str = "vi"
    source_language: str = "auto"
    operation_kind: str = "translate"
    protocol_version: int = 1
    credentials: Dict[str, str] = field(default_factory=dict)

    def to_dict(self, redact_secrets: bool = True) -> Dict[str, Any]:
        data = asdict(self)
        if redact_secrets and "credentials" in data:
            data["credentials"] = {k: "***REDACTED***" for k in data["credentials"]}
        return data

    def to_json(self, redact_secrets: bool = True) -> str:
        return json.dumps(self.to_dict(redact_secrets=redact_secrets))

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "InputEnvelope":
        input_data = data["input"]
        profile_data = data["profile_snapshot"]
        return cls(
            job_id=data["job_id"],
            page_identity=data["page_identity"],
            attempt_id=data["attempt_id"],
            fencing_token=data["fencing_token"],
            input=InputSource(**input_data),
            workdir=data["workdir"],
            profile_snapshot=ProfileSnapshot(**profile_data),
            target_language=data.get("target_language", "vi"),
            source_language=data.get("source_language", "auto"),
            operation_kind=data.get("operation_kind", "translate"),
            protocol_version=data.get("protocol_version", 1),
            credentials=data.get("credentials", {}),
        )


@dataclass
class StageEvent:
    event_type: str  # "stage_started", "stage_progress", "stage_completed", "error", "warning"
    stage: str  # "detection", "ocr", "translation", "cleaning", "rendering", "assembly"
    progress_pct: float
    message: str
    elapsed_ms: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps(asdict(self))


@dataclass
class OutputManifest:
    job_id: str
    page_identity: str
    attempt_id: str
    operation_kind: str
    success: bool
    protocol_version: int = 1
    output_image_path: Optional[str] = None
    clean_image_path: Optional[str] = None
    mask_image_path: Optional[str] = None
    output_sha256: Optional[str] = None
    width: int = 0
    height: int = 0
    detected_regions_count: int = 0
    translated_regions_count: int = 0
    regions: List[RegionTranscript] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    timings_ms: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict())
