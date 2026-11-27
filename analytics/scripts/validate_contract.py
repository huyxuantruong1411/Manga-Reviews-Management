"""Schema contract loader and validator for Manga Deep Analytics."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONTRACT_PATH = REPO_ROOT / "analytics" / "schema_contract.yml"


class ContractValidationError(ValueError):
    """Raised when analytics/schema_contract.yml violates required contract rules."""


def _check_no_placeholders(obj: Any, path: str = "") -> None:
    if isinstance(obj, str):
        if "<" in obj and ">" in obj:
            raise ContractValidationError(f"Placeholder detected at {path}: {obj}")
    elif isinstance(obj, dict):
        for k, v in obj.items():
            _check_no_placeholders(v, f"{path}.{k}" if path else str(k))
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            _check_no_placeholders(item, f"{path}[{idx}]")


def load_contract(contract_path: Path = DEFAULT_CONTRACT_PATH) -> dict[str, Any]:
    if not contract_path.exists():
        raise ContractValidationError(f"Schema contract not found: {contract_path}")
    raw_text = contract_path.read_text(encoding="utf-8")
    data = yaml.safe_load(raw_text)
    if not isinstance(data, dict):
        raise ContractValidationError("Schema contract root must be a YAML mapping")
    validate_contract(data)
    return data


def validate_contract(contract: dict[str, Any]) -> None:
    _check_no_placeholders(contract)

    for required_top in ("contract_version", "source", "capabilities", "entities", "marts_enabled"):
        if required_top not in contract:
            raise ContractValidationError(f"Missing top-level contract key: {required_top}")

    source = contract["source"]
    if source.get("engine") != "mongodb":
        raise ContractValidationError(f"Unsupported source.engine: {source.get('engine')} (expected mongodb)")

    entities = contract["entities"]
    if not isinstance(entities, dict) or not entities:
        raise ContractValidationError("Contract entities must be a non-empty mapping")

    for name, cfg in entities.items():
        if not isinstance(cfg, dict):
            raise ContractValidationError(f"Entity {name} must be a mapping")
        for req in ("database", "collection", "enabled", "primary_key"):
            if req not in cfg:
                raise ContractValidationError(f"Entity {name} missing required key: {req}")
        if cfg.get("database") not in ("primary", "pool"):
            raise ContractValidationError(f"Entity {name} has invalid database alias: {cfg.get('database')}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate analytics/schema_contract.yml")
    parser.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT_PATH)
    args = parser.parse_args()
    contract = load_contract(args.contract)
    enabled_entities = [k for k, v in contract["entities"].items() if v.get("enabled")]
    print(
        f"Contract valid (version={contract['contract_version']}, "
        f"live_profile_complete={contract.get('live_profile_complete')}, "
        f"enabled_entities={len(enabled_entities)})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
