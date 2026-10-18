import os
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mongodb_uri: str = Field(default="mongodb://localhost:27017")
    database_name: str = Field(default="manga_library")

    minio_endpoint: str = Field(default="localhost:9000")
    minio_access_key: str = Field(default="admin")
    minio_secret_key: str = Field(default="password")
    minio_bucket: str = Field(default="manga-library")
    minio_bucket_name: str = Field(default="manga-library")
    minio_secure: bool = Field(default=False)
    redis_url: str = Field(default="redis://127.0.0.1:6379/0")

    gemini_api_key: str = Field(default="")
    translator_python_path: Optional[str] = Field(default=None)

    download_dir: str = Field(default="d:/Projects/Manga/Manga-Reviews-Management/downloads")

    mangadex_proxy: Optional[str] = Field(default=None)
    mangadex_client_id: Optional[str] = Field(default=None)
    mangadex_client_secret: Optional[str] = Field(default=None)
    mangadex_username: Optional[str] = Field(default=None)
    mangadex_password: Optional[str] = Field(default=None)

    port: int = 8000
    host: str = "127.0.0.1"

    # Structured Logging (ECS)
    log_level: str = Field(default="INFO")
    log_format: str = Field(default="console")  # "console" | "json"
    log_file_enabled: bool = Field(default=False)
    log_dir: str = Field(default="logs")
    log_skip_paths: list[str] = Field(default=["/health"])
    service_environment: str = Field(default="dev")

    # Elasticsearch & Kibana (used from Phase 5+)
    es_enabled: bool = Field(default=False)
    es_url: str = Field(default="http://127.0.0.1:9200")
    es_username: str = Field(default="manga_app")
    es_password: str = Field(default="")
    es_request_timeout_s: int = Field(default=3)
    audit_es_sync_enabled: bool = Field(default=False)
    audit_es_search_enabled: bool = Field(default=False)
    audit_es_index: str = Field(default="manga-audit")
    kibana_url: str = Field(default="http://127.0.0.1:5601")
    kibana_dashboard_id: str = Field(default="manga-system-overview")

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
