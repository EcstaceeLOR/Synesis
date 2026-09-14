"""Validated runtime configuration for the adapter."""

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings read from environment variables with safe local defaults."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    synesis_mode: Literal["demo", "live"] = "demo"
    olas_adapter_host: str = "0.0.0.0"
    olas_adapter_port: int = Field(default=8100, ge=1, le=65535)


settings = Settings()
