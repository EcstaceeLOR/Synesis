"""Keyless implementation of the official mech-client Signer protocol."""

import hmac
from collections.abc import Mapping
from typing import Any, Protocol

import httpx
from pydantic import ValidationError

from synesis_olas.errors import AdapterError, DisabledCapabilityError
from synesis_olas.models import GatewayReceipt, RawTransaction, normalize_hex


class HttpPoster(Protocol):
    """The narrow HTTP surface used by the external signer."""

    def post(
        self,
        url: str,
        *,
        json: Mapping[str, Any],
        headers: Mapping[str, str],
        timeout: float,
    ) -> httpx.Response: ...


class KeeperHubExternalSigner:
    """Delegate unsigned calls to the internal KeeperHub gateway.

    This class structurally implements ``mech_client.Signer`` without importing
    private-key libraries. Only transaction submission exists in v1; every
    message and Safe signature method fails closed.
    """

    def __init__(
        self,
        *,
        address: str,
        gateway_url: str,
        internal_token: str,
        economic_intent_id: str,
        mech_address: str,
        approved_maximum_amount: int,
        approval_reference: str,
        manifest_version: str,
        manifest_hash: str,
        client: HttpPoster | None = None,
    ) -> None:
        try:
            validated = RawTransaction.model_validate(
                {"chainId": 8453, "to": address, "value": 0, "data": "0x00"}
            )
        except ValidationError as exc:
            raise ValueError("KeeperHub signer address must be an EVM address") from exc
        parsed_url = httpx.URL(gateway_url)
        if parsed_url.scheme != "https" and parsed_url.host not in {
            "api",
            "localhost",
            "127.0.0.1",
        }:
            raise ValueError("KeeperHub gateway must use HTTPS or private/local service networking")
        if len(internal_token) < 32:
            raise ValueError("The internal service token must contain at least 32 characters")
        self._address = validated.to
        self._gateway_url = str(parsed_url)
        self._internal_token = internal_token
        self._economic_intent_id = economic_intent_id
        self._mech_address = mech_address
        if approved_maximum_amount < 0:
            raise ValueError("Approved maximum amount cannot be negative")
        self._approved_maximum_amount = approved_maximum_amount
        if len(approval_reference) < 8:
            raise ValueError("Approval reference must contain at least 8 characters")
        self._approval_reference = approval_reference
        self._manifest_version = manifest_version
        self._manifest_hash = manifest_hash
        self._client = client or httpx.Client()
        self.last_receipt: GatewayReceipt | None = None

    @property
    def address(self) -> str:
        """The KeeperHub organization wallet that will execute the call."""

        return self._address

    def send_transaction(self, unsigned_tx: dict[str, Any]) -> str:
        """Send an unsigned, Base-only call to the policy-enforcing gateway."""

        forbidden = {"privateKey", "rawTransaction", "signature", "r", "s", "v"}
        if forbidden.intersection(unsigned_tx):
            raise AdapterError(
                "SIGNED_TRANSACTION_REFUSED", "Only unsigned calls are accepted", 422
            )
        try:
            tx = RawTransaction.model_validate(unsigned_tx)
        except ValidationError as exc:
            raise AdapterError(
                "INVALID_UNSIGNED_TRANSACTION", "Unsigned transaction is invalid", 422
            ) from exc
        if tx.value != 0:
            raise AdapterError("NATIVE_VALUE_REFUSED", "Native value is disabled for Olas v1", 422)
        if tx.from_address and tx.from_address.lower() != self.address.lower():
            raise AdapterError(
                "SIGNER_ADDRESS_MISMATCH",
                "Unsigned transaction sender does not match the KeeperHub wallet",
                422,
            )
        response = self._client.post(
            self._gateway_url,
            json={
                "economicIntentId": self._economic_intent_id,
                "mechAddress": self._mech_address,
                "approvedMaximumAmount": str(self._approved_maximum_amount),
                "approvalReference": self._approval_reference,
                "manifestVersion": self._manifest_version,
                "manifestHash": self._manifest_hash,
                "chainId": tx.chain_id,
                "from": self.address,
                "to": normalize_hex(tx.to),
                "value": tx.value,
                "data": tx.data.lower(),
            },
            headers={
                "authorization": f"Bearer {self._internal_token}",
                "content-type": "application/json",
            },
            timeout=30.0,
        )
        if response.status_code != 200:
            raise AdapterError(
                "KEEPERHUB_GATEWAY_REJECTED",
                f"KeeperHub gateway rejected the call with HTTP {response.status_code}",
                502,
            )
        try:
            receipt = GatewayReceipt.model_validate(response.json())
        except (ValueError, ValidationError) as exc:
            raise AdapterError(
                "KEEPERHUB_RECEIPT_UNVERIFIED",
                "KeeperHub gateway did not return a verified successful receipt",
                502,
            ) from exc
        self.last_receipt = receipt
        return receipt.transaction_hash

    def sign_message(self, _message: bytes) -> bytes:
        raise DisabledCapabilityError("sign_message")

    def sign_safe_message(self, _safe_address: str, _chain_id: int, _message: bytes) -> bytes:
        raise DisabledCapabilityError("Olas Safe/agent message signing")


def authenticate_internal_token(supplied: str | None, expected: str) -> bool:
    """Constant-time internal bearer-token check."""

    return supplied is not None and hmac.compare_digest(supplied, expected)
