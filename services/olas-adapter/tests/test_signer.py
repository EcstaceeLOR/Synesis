"""Tests for the keyless mech-client Signer implementation."""

from collections.abc import Mapping
from typing import Any

import httpx
import pytest

from synesis_olas.errors import AdapterError, DisabledCapabilityError
from synesis_olas.signer import KeeperHubExternalSigner

ADDRESS = "0x1111111111111111111111111111111111111111"
TARGET = "0x2222222222222222222222222222222222222222"
TX_HASH = "0x" + "ab" * 32
TOKEN = "a" * 32


class FakePoster:
    def __init__(self, payload: dict[str, Any], status_code: int = 200) -> None:
        self.payload = payload
        self.status_code = status_code
        self.calls: list[dict[str, Any]] = []

    def post(
        self,
        url: str,
        *,
        json: Mapping[str, Any],
        headers: Mapping[str, str],
        timeout: float,
    ) -> httpx.Response:
        self.calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        return httpx.Response(self.status_code, json=self.payload)


def build_signer(poster: FakePoster) -> KeeperHubExternalSigner:
    return KeeperHubExternalSigner(
        address=ADDRESS,
        gateway_url="http://api:8080/internal/v1/keeperhub/submit-call",
        internal_token=TOKEN,
        economic_intent_id="intent_123",
        manifest_version="base-v1",
        manifest_hash="sha256:" + "12" * 32,
        client=poster,
    )


def test_unsigned_transaction_is_delegated_and_verified() -> None:
    poster = FakePoster(
        {
            "execution_id": "kh_exec_123",
            "transaction_hash": TX_HASH,
            "verified": True,
            "receipt_status": "success",
        }
    )
    signer = build_signer(poster)

    assert (
        signer.send_transaction({"chainId": 8453, "to": TARGET, "value": 0, "data": "0x12345678"})
        == TX_HASH
    )
    assert poster.calls[0]["json"]["economicIntentId"] == "intent_123"
    assert poster.calls[0]["headers"]["authorization"] == f"Bearer {TOKEN}"
    assert signer.last_receipt is not None


def test_signatures_native_value_and_unverified_receipts_fail_closed() -> None:
    poster = FakePoster(
        {
            "execution_id": "kh_exec_123",
            "transaction_hash": TX_HASH,
            "verified": False,
            "receipt_status": "success",
        }
    )
    signer = build_signer(poster)
    with pytest.raises(DisabledCapabilityError, match="sign_message"):
        signer.sign_message(b"digest")
    with pytest.raises(DisabledCapabilityError, match="Safe/agent"):
        signer.sign_safe_message(ADDRESS, 8453, b"digest")
    with pytest.raises(AdapterError, match="Native value"):
        signer.send_transaction({"chainId": 8453, "to": TARGET, "value": 1, "data": "0x12345678"})
    with pytest.raises(AdapterError, match="Only unsigned"):
        signer.send_transaction(
            {
                "chainId": 8453,
                "to": TARGET,
                "value": 0,
                "data": "0x12345678",
                "signature": "secret",
            }
        )
    with pytest.raises(AdapterError, match="sender does not match"):
        signer.send_transaction(
            {
                "chainId": 8453,
                "from": TARGET,
                "to": TARGET,
                "value": 0,
                "data": "0x12345678",
            }
        )
    with pytest.raises(AdapterError, match="verified successful"):
        signer.send_transaction({"chainId": 8453, "to": TARGET, "value": 0, "data": "0x12345678"})
