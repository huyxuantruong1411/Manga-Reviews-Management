from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
import os
from typing import Optional

class Settings(BaseSettings):
    mongodb_uri: str = Field(default="mongodb://localhost:27017")
    database_name: str = Field(default="manga_library")
    
    minio_endpoint: str = Field(default="localhost:9000")
    minio_access_key: str = Field(default="admin")
    minio_secret_key: str = Field(default="password")
    minio_bucket: str = Field(default="manga-library")
    
    gemini_api_key: str = Field(default="")
    
    download_dir: str = Field(default="d:/Projects/Manga/Manga-Reviews-Management/downloads")
    
    mangadex_proxy: Optional[str] = Field(default=None)
    mangadex_client_id: Optional[str] = Field(default=None)
    mangadex_client_secret: Optional[str] = Field(default=None)
    mangadex_username: Optional[str] = Field(default=None)
    mangadex_password: Optional[str] = Field(default=None)
    
    port: int = 8000
    host: str = "0.0.0.0"
    
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
