"""Keyless Olas quoting, request planning, and delivery interpretation."""

import hashlib
import json
import re
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Literal

from eth_abi.abi import default_codec
from eth_utils.crypto import keccak

from synesis_olas.errors import AdapterError, DisabledCapabilityError
from synesis_olas.models import (
    AdapterHealth,
    CapabilityStatus,
    DeliveryRequest,
    DeliveryResponse,
    IpfsEnvelope,
    QuoteRequest,
    QuoteResponse,
    RequestPlanRequest,
    RequestPlanResponse,
    UnsignedCall,
    normalize_hex,
)
from synesis_olas.official import PINNED_MECH_CLIENT_VERSION, installed_mech_client_version
from synesis_olas.ports import OlasClientPort

BASE_CHAIN_ID: Literal[8453] = 8453
USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
OLAS_MARKETPLACE = "0xf24ee42eda0fc9b33b7d41b06ee8ccd2ef7c5020"
OLAS_USDC_BALANCE_TRACKER = "0x0443c55e151dba13fae079518f9dd01ff9c21cb2"
USDC_PAYMENT_TYPE = "6406bb5f31a732f898e1ce9fdd988a80a808d36ab5d9a4a4805a8be8d197d5e3"
MAX_USDC_RATE = 1_000_000
MAX_PROMPT_BYTES = 8_192
MAX_DELIVERY_BYTES = 256_000
MANIFEST_VERSION = "base-2026-09-15.2"
MANIFEST_HASH = "sha256:7601b8c8bce4817d5a7a376ee354f8da55f3ec633b833713d973fd5966d91c7a"
DisabledMode = Literal["sign_message", "offchain", "agent", "safe"]
DISABLED_MODES: tuple[DisabledMode, ...] = ("sign_message", "offchain", "agent", "safe")


def _canonical_bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def _content_hash(value: object) -> str:
    return f"sha256:{hashlib.sha256(_canonical_bytes(value)).hexdigest()}"


def _selector(signature: str) -> bytes:
    return keccak(text=signature)[:4]


def _calldata(signature: str, types: list[str], values: list[object]) -> str:
    return "0x" + (_selector(signature) + default_codec.encode(types, values)).hex()


class OlasAdapterService:
    """Stable application service around one official-client port."""

    def __init__(
        self,
        client: OlasClientPort,
        *,
        environment: Literal["demo", "live"] = "demo",
        now: Callable[[], datetime] | None = None,
        manifest_version: str = MANIFEST_VERSION,
        manifest_hash: str = MANIFEST_HASH,
    ) -> None:
        self.client = client
        self.environment = environment
        self.now = now or (lambda: datetime.now(UTC))
        self.manifest_version = manifest_version
        self.manifest_hash = manifest_hash

    def health(self) -> AdapterHealth:
        version = installed_mech_client_version()
        checks = {
            "mech_client_pinned": version == PINNED_MECH_CLIENT_VERSION,
            "base_only": True,
            "manifest_pinned": self.manifest_hash.startswith("sha256:"),
            "local_key_absent": True,
            "message_signing_disabled": True,
            "offchain_disabled": True,
            "agent_and_safe_disabled": True,
        }
        return AdapterHealth(
            service="olas-adapter",
            status="ok" if all(checks.values()) else "degraded",
            environment=self.environment,
            chain_id=BASE_CHAIN_ID,
            checked_at=self.now(),
            version="0.1.0",
            mech_client_version=version,
            manifest_version=self.manifest_version,
            manifest_hash=self.manifest_hash,
            capabilities=CapabilityStatus(
                external_transaction_signer=True,
                local_private_key=False,
                sign_message=False,
                offchain=False,
                agent_mode=False,
                safe_mode=False,
            ),
            checks=checks,
        )

    def quote(self, request: QuoteRequest) -> QuoteResponse:
        mech = next(
            (
                item
                for item in self.client.discover()
                if item.address.lower() == request.mech_address.lower()
            ),
            None,
        )
        if mech is None:
            raise AdapterError("MECH_NOT_DISCOVERED", "Mech is not in live Olas discovery", 404)
        if mech.tools and request.tool not in mech.tools:
            raise AdapterError("TOOL_NOT_DISCOVERED", "Tool is not advertised by this Mech", 404)
        payment_name, rate, tool_schema = self.client.quote_details(mech, request.tool)
        if payment_name != "USDC_TOKEN":
            raise AdapterError(
                "PAYMENT_TYPE_UNSUPPORTED",
                "Synesis v1 only permits Olas fixed-price USDC payments",
                422,
            )
        if rate <= 0 or rate > MAX_USDC_RATE:
            raise AdapterError(
                "DELIVERY_RATE_EXCEEDS_POLICY",
                f"Mech rate must be between 1 and {MAX_USDC_RATE} USDC base units",
                422,
            )
        if len(_canonical_bytes(tool_schema)) > 64_000:
            raise AdapterError("TOOL_SCHEMA_TOO_LARGE", "Olas tool schema exceeds 64 KB", 422)
        return QuoteResponse(
            chain_id=BASE_CHAIN_ID,
            mech=mech,
            tool_schema=tool_schema,
            payment_type="USDC_TOKEN",
            payment_type_hash="0x" + USDC_PAYMENT_TYPE,
            token_address=USDC_ADDRESS,
            approval_spender=OLAS_USDC_BALANCE_TRACKER,
            unit_amount=rate,
            maximum_amount=rate,
            decimals=6,
            expires_at=self.now() + timedelta(seconds=60),
        )

    def create_request_plan(self, request: RequestPlanRequest) -> RequestPlanResponse:
        if len(request.prompt.encode()) > MAX_PROMPT_BYTES:
            raise AdapterError("PROMPT_TOO_LARGE", "Prompt exceeds 8192 UTF-8 bytes", 422)
        quote = self.quote(
            QuoteRequest(mech_address=request.mech_address, tool=request.tool, quantity=1)
        )
        attributes = {
            "schema_version": "synesis.mech-request.v1",
            "economic_intent_id": request.economic_intent_id,
            "manifest_version": self.manifest_version,
            "manifest_hash": self.manifest_hash,
            "nonce": _content_hash(
                {
                    "economic_intent_id": request.economic_intent_id,
                    "mech": normalize_hex(request.mech_address),
                    "tool": request.tool,
                }
            ),
        }
        request_data, cid_hex = self.client.publish_envelope(
            request.prompt, request.tool, attributes
        )
        request_data = normalize_hex(request_data)
        try:
            request_data_bytes = bytes.fromhex(request_data[2:])
        except ValueError as exc:
            raise AdapterError(
                "INVALID_IPFS_HASH", "Olas returned an invalid request data hash", 502
            ) from exc
        if len(request_data_bytes) != 32 or not re.fullmatch(r"f[0-9a-f]+", cid_hex):
            raise AdapterError(
                "INVALID_IPFS_HASH", "Olas returned an invalid request data hash", 502
            )
        envelope_binding = _content_hash(
            {
                **attributes,
                "prompt": request.prompt,
                "tool": request.tool,
                "request_data": request_data,
                "cid_hex": cid_hex,
            }
        )
        approval_signature = "approve(address,uint256)"
        request_signature = "request(bytes,uint256,bytes32,address,uint256,bytes)"
        approval = UnsignedCall(
            step_id="olas-usdc-approval",
            purpose="olas_payment_approval",
            chain_id=BASE_CHAIN_ID,
            from_address=normalize_hex(request.payer_address),
            to=USDC_ADDRESS,
            value=0,
            data=_calldata(
                approval_signature,
                ["address", "uint256"],
                [OLAS_USDC_BALANCE_TRACKER, quote.maximum_amount],
            ),
            function_signature=approval_signature,
            idempotency_key=f"synesis:{request.economic_intent_id}:olas:approve",
        )
        marketplace_call = UnsignedCall(
            step_id="olas-marketplace-request",
            purpose="olas_marketplace_request",
            chain_id=BASE_CHAIN_ID,
            from_address=normalize_hex(request.payer_address),
            to=OLAS_MARKETPLACE,
            value=0,
            data=_calldata(
                request_signature,
                ["bytes", "uint256", "bytes32", "address", "uint256", "bytes"],
                [
                    request_data_bytes,
                    quote.maximum_amount,
                    bytes.fromhex(USDC_PAYMENT_TYPE),
                    normalize_hex(request.mech_address),
                    request.response_timeout,
                    b"",
                ],
            ),
            function_signature=request_signature,
            idempotency_key=f"synesis:{request.economic_intent_id}:olas:request",
        )
        envelope = IpfsEnvelope(
            schema_version="synesis.mech-request.v1",
            request_data=request_data,
            cid_hex=cid_hex,
            content_binding=envelope_binding,
        )
        plan_material = {
            "plan_version": "synesis.olas-plan.v1",
            "manifest_version": self.manifest_version,
            "manifest_hash": self.manifest_hash,
            "quote": quote.model_dump(mode="json"),
            "envelope": envelope.model_dump(mode="json"),
            "calls": [approval.model_dump(mode="json"), marketplace_call.model_dump(mode="json")],
            "disabled_modes": DISABLED_MODES,
        }
        return RequestPlanResponse(
            plan_version="synesis.olas-plan.v1",
            plan_hash=_content_hash(plan_material),
            manifest_version=self.manifest_version,
            manifest_hash=self.manifest_hash,
            quote=quote,
            envelope=envelope,
            calls=(approval, marketplace_call),
            disabled_modes=DISABLED_MODES,
        )

    def parse_delivery(self, request: DeliveryRequest) -> DeliveryResponse:
        request_id = request.request_id.removeprefix("0x").lower()
        request_id_decimal = str(int(request_id, 16))
        source_url, payload = self.client.fetch_delivery(request.delivery_data, request_id_decimal)
        if payload is None:
            raise AdapterError("IPFS_DELIVERY_UNAVAILABLE", "Mech delivery is unavailable", 502)
        if not isinstance(payload, dict):
            raise AdapterError(
                "INVALID_DELIVERY_PAYLOAD",
                "Mech delivery must be a JSON object",
                422,
            )
        size = len(_canonical_bytes(payload))
        if size > MAX_DELIVERY_BYTES:
            raise AdapterError("DELIVERY_TOO_LARGE", "Mech delivery exceeds 256 KB", 422)
        declared_request_id = payload.get("request_id")
        if declared_request_id is not None:
            normalized_declared = str(declared_request_id).removeprefix("0x").lower()
            if normalized_declared not in {request_id, request_id_decimal}:
                raise AdapterError(
                    "DELIVERY_REQUEST_MISMATCH",
                    "Mech delivery is bound to a different request ID",
                    409,
                )
        return DeliveryResponse(
            request_id="0x" + request_id,
            mech_address=normalize_hex(request.expected_mech),
            source_url=source_url,
            content_hash=_content_hash(payload),
            payload=payload,
        )

    @staticmethod
    def assert_v1_mode(*, offchain: bool = False, agent_mode: bool = False) -> None:
        if offchain:
            raise DisabledCapabilityError("offchain mode")
        if agent_mode:
            raise DisabledCapabilityError("Olas Safe/agent mode")
