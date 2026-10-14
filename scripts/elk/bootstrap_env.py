"""Bootstrap script to generate infra/elk/.env with secure random credentials."""

from __future__ import annotations

import argparse
import secrets
from pathlib import Path

# Required credential keys to generate
CREDENTIAL_KEYS = (
    "ELASTIC_PASSWORD",
    "KIBANA_PASSWORD",
    "LOGSTASH_WRITER_PASSWORD",
    "APP_ES_PASSWORD",
    "KIBANA_VIEWER_PASSWORD",
)
ENCRYPTION_KEY = "KIBANA_ENCRYPTION_KEY"


def generate_password(length: int = 24) -> str:
    """Generate a high-entropy URL-safe alphanumeric password."""
    return secrets.token_urlsafe(length)


def generate_encryption_key(min_length: int = 32) -> str:
    """Generate a hex encryption key (>= 32 chars) for Kibana session security."""
    return secrets.token_hex(max(min_length, 32))


def bootstrap_elk_env(
    example_path: Path | str,
    output_path: Path | str,
    log_dir_path: Path | str = "logs",
    *,
    force: bool = False,
) -> dict[str, str]:
    """Generates an ELK .env file from an example template with random secrets.

    Returns the dictionary of generated keys and values.
    """
    example_file = Path(example_path)
    output_file = Path(output_path)
    log_dir = Path(log_dir_path)

    # 1. Ensure log directory exists
    log_dir.mkdir(parents=True, exist_ok=True)

    # 2. Check if output already exists
    if output_file.exists() and not force:
        print(f"Info: {output_file} already exists. Use --force to regenerate.")
        return {}

    if not example_file.exists():
        raise FileNotFoundError(f"Example template not found at {example_file}")

    template_content = example_file.read_text(encoding="utf-8")

    generated: dict[str, str] = {}
    for key in CREDENTIAL_KEYS:
        generated[key] = generate_password()

    # Encryption key must be >= 32 characters
    generated[ENCRYPTION_KEY] = generate_encryption_key(32)

    # Replace placeholders in template
    output_lines = []
    for line in template_content.splitlines():
        replaced = False
        for key, val in generated.items():
            if line.startswith(f"{key}="):
                output_lines.append(f"{key}={val}")
                replaced = True
                break
        if not replaced:
            output_lines.append(line)

    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text("\n".join(output_lines) + "\n", encoding="utf-8")
    print(f"Successfully generated {output_file} with secure random secrets.")
    return generated


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap infra/elk/.env file")
    parser.add_argument(
        "--example",
        default="infra/elk/.env.example",
        help="Path to .env.example template",
    )
    parser.add_argument(
        "--output",
        default="infra/elk/.env",
        help="Path to output .env file",
    )
    parser.add_argument(
        "--log-dir",
        default="logs",
        help="Path to logs directory to ensure exists",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing .env file if it exists",
    )
    args = parser.parse_args()

    bootstrap_elk_env(
        example_path=args.example,
        output_path=args.output,
        log_dir_path=args.log_dir,
        force=args.force,
    )


if __name__ == "__main__":
    main()
