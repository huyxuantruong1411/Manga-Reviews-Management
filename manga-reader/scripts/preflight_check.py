#!/usr/bin/env python3
"""Pre-Flight Environment & Dynamic Port Discovery Script for Manga Reader Backend.

Checks host port availability (both OS sockets and running Docker containers),
creates persistent Drive D directories for Docker bind mounts, and generates
a conflict-free .env configuration file.
"""

from __future__ import annotations

import secrets
import socket
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DEFAULT_PORTS = {
    "BACKEND_HOST_PORT": 18000,
    "POSTGRES_HOST_PORT": 15432,
    "REDIS_HOST_PORT": 16379,
    "MINIO_API_HOST_PORT": 19000,
    "MINIO_CONSOLE_HOST_PORT": 19001,
}

PERSISTENT_DATA_DIRS = [
    BASE_DIR / "postgres_data",
    BASE_DIR / "redis_data",
    BASE_DIR / "minio_data",
]


def is_port_in_use(port: int) -> bool:
    """Check if a TCP port is currently bound on IPv4 localhost or 0.0.0.0."""
    for family, addr in [(socket.AF_INET, "127.0.0.1"), (socket.AF_INET, "0.0.0.0")]:
        with socket.socket(family, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            if sock.connect_ex((addr, port)) == 0:
                return True
    return False


def get_docker_ports() -> tuple[set[int], set[int]]:
    """Retrieve (other_container_ports, own_mr_container_ports) from running Docker containers."""
    other_ports: set[int] = set()
    own_ports: set[int] = set()
    try:
        res = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}\t{{.Ports}}"],
            capture_output=True,
            text=True,
            check=True,
        )
        for line in res.stdout.splitlines():
            if not line.strip():
                continue
            parts_tab = line.split("\t", 1)
            container_name = parts_tab[0].strip()
            is_own = container_name.startswith("mr_")
            ports_col = parts_tab[1] if len(parts_tab) > 1 else ""
            for part in ports_col.split(","):
                if "->" in part and ":" in part:
                    host_part = part.split("->")[0].strip()
                    port_str = host_part.rsplit(":", 1)[-1]
                    if port_str.isdigit():
                        p = int(port_str)
                        if is_own:
                            own_ports.add(p)
                        else:
                            other_ports.add(p)
    except Exception as exc:
        print(f"[WARN] Could not query 'docker ps': {exc}", file=sys.stderr)
    return other_ports, own_ports


def find_free_port(preferred_port: int, reserved: set[int], own_ports: set[int]) -> int:
    """Find the preferred port (allowing ports already bound by our own mr_* containers) or next free port."""
    port = preferred_port
    while port in reserved or (port not in own_ports and is_port_in_use(port)):
        print(f"[INFO] Port {port} is busy, probing next port...")
        port += 1
    reserved.add(port)
    return port


def ensure_drive_d_data_dirs() -> None:
    """Ensure all Docker persistent data directories exist on Drive D."""
    for data_dir in PERSISTENT_DATA_DIRS:
        data_dir.mkdir(parents=True, exist_ok=True)
        drive = data_dir.resolve().drive.upper()
        if drive and not drive.startswith("D:"):
            raise RuntimeError(f"Persistent data directory {data_dir} must reside on Drive D (found {drive})")
        print(f"  + Persistent storage ready on Drive D: {data_dir.resolve()}")


def main() -> None:
    print("=== MANGA READER v2.0 PRE-FLIGHT ENVIRONMENT & PORT CHECK ===")
    ensure_drive_d_data_dirs()

    other_ports, own_ports = get_docker_ports()
    if other_ports:
        print(f"[INFO] Ports bound by other Docker containers: {sorted(other_ports)}")
    if own_ports:
        print(f"[INFO] Ports already bound by Manga Reader stack (mr_*): {sorted(own_ports)}")

    env_path = BASE_DIR / ".env"
    if env_path.exists():
        print(f"[INFO] Existing .env found at {env_path.resolve()}. Keeping existing configuration.")
        return

    allocated_ports: dict[str, int] = {}
    reserved = set(other_ports)

    for key, preferred in DEFAULT_PORTS.items():
        free_port = find_free_port(preferred, reserved, own_ports)
        allocated_ports[key] = free_port
        status = "OK (Preferred)" if free_port == preferred else f"REASSIGNED ({preferred} -> {free_port})"
        print(f"  + {key}: {free_port} [{status}]")

    jwt_secret = secrets.token_hex(32)
    env_content = f"""# ============================================================================
# AUTO-GENERATED CONFLICT-FREE ENVIRONMENT CONFIGURATION
# ============================================================================
PROJECT_NAME=manga-reader-backend
ENVIRONMENT=development

# --- Host Ports (Verified Conflict-Free) ---
BACKEND_HOST_PORT={allocated_ports["BACKEND_HOST_PORT"]}
POSTGRES_HOST_PORT={allocated_ports["POSTGRES_HOST_PORT"]}
REDIS_HOST_PORT={allocated_ports["REDIS_HOST_PORT"]}
MINIO_API_HOST_PORT={allocated_ports["MINIO_API_HOST_PORT"]}
MINIO_CONSOLE_HOST_PORT={allocated_ports["MINIO_CONSOLE_HOST_PORT"]}

# --- Database (PostgreSQL 16) ---
POSTGRES_USER=manga_user
POSTGRES_PASSWORD=manga_secret_pwd_change_me
POSTGRES_DB=manga_reader_db
POSTGRES_HOST=127.0.0.1
DATABASE_URL=postgresql+asyncpg://manga_user:manga_secret_pwd_change_me@127.0.0.1:{allocated_ports["POSTGRES_HOST_PORT"]}/manga_reader_db

# --- Redis 7 ---
REDIS_URL=redis://127.0.0.1:{allocated_ports["REDIS_HOST_PORT"]}/0

# --- MinIO Object Storage (Drive D Bind Mount) ---
MINIO_ROOT_USER=minio_admin
MINIO_ROOT_PASSWORD=minio_secret_pwd_change_me
MINIO_ENDPOINT=127.0.0.1:{allocated_ports["MINIO_API_HOST_PORT"]}
MINIO_SECURE=false
MINIO_BUCKET_LIBRARY=manga-library
MINIO_BUCKET_AVATARS=user-avatars
MINIO_BUCKET_STAGING=etl-staging

# --- External Source: Manga Data Lake & Storage Pool Integration ---
DATA_LAKE_API_URL=http://localhost:8000/api/datalake-pool
SOURCE_MINIO_ENDPOINT=localhost:9000
SOURCE_MINIO_ACCESS_KEY=minioadmin
SOURCE_MINIO_SECRET_KEY=minioadmin
SOURCE_MINIO_SECURE=false

# --- JWT & Security ---
JWT_SECRET_KEY={jwt_secret}
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
EMAIL_OTP_EXPIRE_SECONDS=120
"""
    env_path.write_text(env_content, encoding="utf-8")
    print(f"\n[SUCCESS] Conflict-free .env initialized at: {env_path.resolve()}")


if __name__ == "__main__":
    main()
