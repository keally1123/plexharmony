"""
Configuration management - all secrets from environment variables
"""
import secrets
from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import field_validator


class Settings(BaseSettings):
    APP_NAME: str = "PlexHarmony"
    DEBUG: bool = False
    SECRET_KEY: str = secrets.token_urlsafe(64)

    # Auth
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD_HASH: str = "$2b$12$placeholder_hash_replace_me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60

    # Plex
    PLEX_URL: str = "http://localhost:32400"
    PLEX_TOKEN: str = "configure_me"
    PLEX_MUSIC_LIBRARY: str = "Music"

    # Last.fm
    LASTFM_API_KEY: Optional[str] = None
    LASTFM_API_SECRET: Optional[str] = None

    # MusicBrainz
    MUSICBRAINZ_URL: Optional[str] = None
    MUSICBRAINZ_APP_NAME: str = "PlexHarmony/1.0"

    # Beets
    BEETS_URL: Optional[str] = None

    # Picard
    PICARD_URL: Optional[str] = None

    # Lidarr
    LIDARR_URL: Optional[str] = None
    LIDARR_API_KEY: Optional[str] = None
    LIDARR_ROOT_FOLDER: Optional[str] = None

    # qBittorrent
    QBIT_URL: Optional[str] = None
    QBIT_USERNAME: str = "admin"
    QBIT_PASSWORD: Optional[str] = None

    # Deluge
    DELUGE_URL: Optional[str] = None
    DELUGE_PASSWORD: Optional[str] = None

    # SABnzbd
    SABNZBD_URL: Optional[str] = None
    SABNZBD_API_KEY: Optional[str] = None

    # AI providers
    ANTHROPIC_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    OLLAMA_URL: Optional[str] = None


    # Custom / self-hosted AI endpoint (OpenAI-compatible)
    CUSTOM_AI_URL: Optional[str] = None
    CUSTOM_AI_API_KEY: Optional[str] = None
    CUSTOM_AI_MODEL: Optional[str] = None

    # Data directory
    DATA_DIR: str = "/app/data"

    # Security
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]
    ALLOWED_HOSTS: List[str] = ["localhost", "127.0.0.1"]
    RATE_LIMIT_PER_MINUTE: int = 60
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_MINUTES: int = 15
    FORCE_HTTPS: bool = False

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",")]
        return v

    @field_validator("ALLOWED_HOSTS", mode="before")
    @classmethod
    def parse_hosts(cls, v):
        if isinstance(v, str):
            return [h.strip() for h in v.split(",")]
        return v

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

    # Custom / self-hosted AI endpoint (OpenAI-compatible)
    #CUSTOM_AI_USERNAME: Optional[str] = None
    #CUSTOM_AI_PASSWORD: Optional[str] = None
