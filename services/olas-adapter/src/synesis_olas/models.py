"""Validated HTTP and domain models for the Olas boundary."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

Address = Annotated[str, Field(pattern=r"^0x[0-9a-fA-F]{40}$")]
Bytes32 = Annotated[str, Field(pattern=r"^(0x)?[0-9a-fA-F]{64}$")]


class StrictModel(BaseModel):
    """Reject unknown fields at every internal API boundary."""

    model_config = ConfigDict(extra="forbid")


class MechKind(StrEnum):
    MARKETPLACE = "marketplace"
    LEGACY = "legacy"


class NormalizedMech(StrictModel):
    address: Address
    service_id: int = Field(ge=1)
    factory_address: Address | None = None
    kind: MechKind
    total_deliveries: int = Field(default=0, ge=0)
    tools: tuple[str, ...] = ()


class QuoteRequest(StrictModel):
    mech_address: Address
    tool: str = Field(min_length=1, max_length=128)
    quantity: int = Field(default=1, ge=1, le=1)


class QuoteResponse(StrictModel):
    chain_id: Literal[8453]
    mech: NormalizedMech
    tool_schema: dict[str, Any]
    payment_type: Literal["USDC_TOKEN"]
    payment_type_hash: Bytes32
    token_address: Address
    approval_spender: Address
    unit_amount: int = Field(gt=0)
    maximum_amount: int = Field(gt=0)
    decimals: Literal[6]
    expires_at: datetime


class RequestPlanRequest(StrictModel):
    economic_intent_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9:_-]{2,127}$")
    mech_address: Address
    payer_address: Address
    prompt: str = Field(min_length=1, max_length=8192)
    tool: str = Field(min_length=1, max_length=128)
    response_timeout: int = Field(default=300, ge=60, le=300)


class UnsignedCall(StrictModel):
    step_id: str
    purpose: Literal["olas_payment_approval", "olas_marketplace_request"]
    chain_id: Literal[8453]
    from_address: Address
    to: Address
    value: Literal[0]
    data: str = Field(pattern=r"^0x[0-9a-fA-F]+$")
    function_signature: str
    idempotency_key: str


class IpfsEnvelope(StrictModel):
    schema_version: Literal["synesis.mech-request.v1"]
    request_data: Bytes32
    cid_hex: str = Field(pattern=r"^f[0-9a-f]+$")
    content_binding: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")


class RequestPlanResponse(StrictModel):
    plan_version: Literal["synesis.olas-plan.v1"]
    plan_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    manifest_version: str
    manifest_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    quote: QuoteResponse
    envelope: IpfsEnvelope
    calls: tuple[UnsignedCall, ...]
    disabled_modes: tuple[Literal["sign_message", "offchain", "agent", "safe"], ...]


class DeliveryRequest(StrictModel):
    request_id: Bytes32
    delivery_data: Bytes32
    expected_mech: Address


class DeliveryResponse(StrictModel):
    request_id: str
    mech_address: Address
    source_url: str
    content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    payload: dict[str, Any]


class CapabilityStatus(StrictModel):
    external_transaction_signer: Literal[True]
    local_private_key: Literal[False]
    sign_message: Literal[False]
    offchain: Literal[False]
    agent_mode: Literal[False]
    safe_mode: Literal[False]


class AdapterHealth(StrictModel):
    service: Literal["olas-adapter"]
    status: Literal["ok", "degraded"]
    environment: Literal["demo", "live"]
    chain_id: Literal[8453]
    checked_at: datetime
    version: str
    mech_client_version: str
    manifest_version: str
    manifest_hash: str
    capabilities: CapabilityStatus
    checks: dict[str, bool]


class GatewayReceipt(StrictModel):
    execution_id: str = Field(
        min_length=1, validation_alias=AliasChoices("execution_id", "executionId")
    )
    transaction_hash: str = Field(
        pattern=r"^0x[0-9a-fA-F]{64}$",
        validation_alias=AliasChoices("transaction_hash", "transactionHash"),
    )
    verified: Literal[True]
    receipt_status: Literal["success"] = Field(
        validation_alias=AliasChoices("receipt_status", "receiptStatus")
    )


class ErrorResponse(StrictModel):
    code: str
    message: str


def normalize_hex(value: str) -> str:
    """Return one lowercase 0x-prefixed representation."""

    return "0x" + value.removeprefix("0x").lower()


class RawTransaction(StrictModel):
    chain_id: Literal[8453] = Field(alias="chainId")
    to: Address
    value: int = Field(default=0, ge=0)
    data: str = Field(pattern=r"^0x[0-9a-fA-F]+$")
    from_address: Address | None = Field(default=None, alias="from")
    gas: int | None = Field(default=None, ge=0)
    nonce: int | None = Field(default=None, ge=0)
    gas_price: int | None = Field(default=None, alias="gasPrice", ge=0)
    max_fee_per_gas: int | None = Field(default=None, alias="maxFeePerGas", ge=0)
    max_priority_fee_per_gas: int | None = Field(default=None, alias="maxPriorityFeePerGas", ge=0)
    transaction_type: int | str | None = Field(default=None, alias="type")

    @field_validator("to")
    @classmethod
    def normalize_address(cls, value: str) -> str:
        return normalize_hex(value)
