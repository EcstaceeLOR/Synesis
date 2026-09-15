"""Validated runtime configuration for the adapter."""

from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Base-only, keyless settings; forbidden v1 modes cannot be enabled."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    synesis_mode: Literal["demo", "live"] = "demo"
    olas_adapter_host: str = "0.0.0.0"
    olas_adapter_port: int = Field(default=8100, ge=1, le=65535)
    olas_adapter_internal_token: SecretStr = Field(
        default=SecretStr("synesis-demo-internal-token-change-me"), min_length=32
    )
    keeperhub_gateway_url: str = "http://api:8080/internal/v1/keeperhub/submit-call"
    keeperhub_wallet_address: str = "0x0000000000000000000000000000000000000000"
    mechx_chain_rpc: str | None = None
    olas_agent_mode: Literal[False] = False
    olas_safe_mode: Literal[False] = False
    olas_use_offchain: Literal[False] = False
    olas_sign_message: Literal[False] = False

    @model_validator(mode="after")
    def validate_live_configuration(self) -> "Settings":
        if self.synesis_mode == "live":
            if self.olas_adapter_internal_token.get_secret_value().startswith("synesis-demo-"):
                raise ValueError("Live mode requires a rotated internal service token")
            if self.keeperhub_wallet_address == "0x0000000000000000000000000000000000000000":
                raise ValueError("Live mode requires the KeeperHub organization wallet")
            if not self.mechx_chain_rpc:
                raise ValueError("Live mode requires a private Base RPC")
        return self


settings = Settings()
