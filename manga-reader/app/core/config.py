"""Core configuration settings for Manga Reader System v2.0."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    PROJECT_NAME: str = "manga-reader-backend"
    ENVIRONMENT: str = "development"

    BACKEND_HOST_PORT: int = 18000
    POSTGRES_HOST_PORT: int = 15432
    REDIS_HOST_PORT: int = 16379
    MINIO_API_HOST_PORT: int = 19000
    MINIO_CONSOLE_HOST_PORT: int = 19001

    POSTGRES_USER: str = "manga_user"
    POSTGRES_PASSWORD: str = "manga_secret_pwd_change_me"
    POSTGRES_DB: str = "manga_reader_db"
    POSTGRES_HOST: str = "localhost"
    DATABASE_URL: str = "postgresql+asyncpg://manga_user:manga_secret_pwd_change_me@localhost:15432/manga_reader_db"

    REDIS_URL: str = "redis://localhost:16379/0"

    MINIO_ROOT_USER: str = "minio_admin"
    MINIO_ROOT_PASSWORD: str = "minio_secret_pwd_change_me"
    MINIO_ENDPOINT: str = "localhost:19000"
    MINIO_SECURE: bool = False
    MINIO_PUBLIC_BASE_URL: str | None = None
    MINIO_BUCKET_LIBRARY: str = "manga-library"
    MINIO_BUCKET_AVATARS: str = "user-avatars"
    MINIO_BUCKET_STAGING: str = "etl-staging"

    # External Source: Manga Data Lake & Storage Pool Integration
    DATA_LAKE_API_URL: str = "http://localhost:8000/api/datalake-pool"
    SOURCE_MINIO_ENDPOINT: str = "localhost:9000"
    SOURCE_MINIO_ACCESS_KEY: str = "minioadmin"
    SOURCE_MINIO_SECRET_KEY: str = "minioadmin"
    SOURCE_MINIO_SECURE: bool = False

    JWT_SECRET_KEY: str = "super_secret_jwt_key_at_least_32_characters_long_2026"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    EMAIL_OTP_EXPIRE_SECONDS: int = 120


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached Settings instance."""
    return Settings()


settings = get_settings()
