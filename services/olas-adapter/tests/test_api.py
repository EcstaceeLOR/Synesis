"""Private API contract tests."""

from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError

from synesis_olas.config import Settings
from synesis_olas.main import create_app
from synesis_olas.models import InspectedMech, MechKind, NormalizedMech
from synesis_olas.service import OlasAdapterService

TOKEN = "internal-test-token-with-32-characters"
MECH = "0x1111111111111111111111111111111111111111"
PAYER = "0x2222222222222222222222222222222222222222"
REQUEST_ID = "0x" + "33" * 32
DELIVERY_DATA = "0x" + "44" * 32


class ApiOlasClient:
    def discover(self) -> tuple[NormalizedMech, ...]:
        return (
            NormalizedMech(
                address=MECH,
                service_id=7,
                kind=MechKind.LEGACY,
                tools=("prediction",),
                metadata_cid="f01701220" + "66" * 32,
            ),
        )

    def inspect_mech(self, mech: NormalizedMech) -> InspectedMech:
        return InspectedMech(
            contract_active=True,
            onchain_service_id=mech.service_id,
            payment_type="USDC_TOKEN",
            unit_amount=10_000,
            tool_schemas={
                "prediction": {
                    "input": {"type": "string"},
                    "output": {"type": "object"},
                }
            },
        )

    def quote_details(self, _mech: NormalizedMech, _tool: str) -> tuple[str, int, dict[str, Any]]:
        return "USDC_TOKEN", 10_000, {"name": "prediction"}

    def publish_envelope(
        self, _prompt: str, _tool: str, _attributes: dict[str, Any]
    ) -> tuple[str, str]:
        return "0x" + "55" * 32, "f01701220" + "55" * 32

    def fetch_delivery(self, _delivery_data: str, request_id_decimal: str) -> tuple[str, object]:
        return f"https://gateway.autonolas.tech/ipfs/result/{request_id_decimal}", {
            "request_id": REQUEST_ID,
            "decision": "supply",
        }


def client() -> TestClient:
    runtime = Settings(olas_adapter_internal_token=SecretStr(TOKEN))
    service = OlasAdapterService(
        ApiOlasClient(),
        now=lambda: datetime(2026, 9, 15, 2, 0, tzinfo=UTC),
    )
    return TestClient(create_app(service=service, runtime_settings=runtime))


def test_private_routes_require_internal_bearer_token() -> None:
    response = client().post(
        "/internal/v1/quotes",
        json={"mech_address": MECH, "tool": "prediction"},
    )

    assert response.status_code == 401
    assert response.json() == {
        "code": "UNAUTHORIZED",
        "message": "Internal service authentication required",
    }


def test_typed_health_quote_plan_and_delivery_contracts() -> None:
    api = client()
    headers = {"Authorization": f"Bearer {TOKEN}"}

    health = api.get("/internal/v1/health", headers=headers)
    mechs = api.get("/internal/v1/mechs", headers=headers)
    quote = api.post(
        "/internal/v1/quotes",
        headers=headers,
        json={"mech_address": MECH, "tool": "prediction"},
    )
    plan = api.post(
        "/internal/v1/request-plans",
        headers=headers,
        json={
            "economic_intent_id": "intent_api_123",
            "mech_address": MECH,
            "payer_address": PAYER,
            "prompt": "Produce one structured recommendation.",
            "tool": "prediction",
        },
    )
    delivery = api.post(
        "/internal/v1/deliveries/parse",
        headers=headers,
        json={
            "request_id": REQUEST_ID,
            "delivery_data": DELIVERY_DATA,
            "expected_mech": MECH,
        },
    )

    assert health.status_code == 200
    assert health.json()["capabilities"]["local_private_key"] is False
    assert mechs.status_code == 200
    assert mechs.json()["mechs"][0]["eligible"] is False
    assert mechs.json()["mechs"][0]["reasons"][0]["code"] == "UNSUPPORTED_SIGNING_MODE"
    assert quote.status_code == 200
    assert quote.json()["maximum_amount"] == 10_000
    assert plan.status_code == 200
    assert len(plan.json()["calls"]) == 2
    assert plan.json()["disabled_modes"] == ["sign_message", "offchain", "agent", "safe"]
    assert delivery.status_code == 200
    assert delivery.json()["payload"]["decision"] == "supply"
    assert api.get("/docs").status_code == 404


def test_unknown_fields_are_rejected() -> None:
    response = client().post(
        "/internal/v1/quotes",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={"mech_address": MECH, "tool": "prediction", "use_offchain": True},
    )

    assert response.status_code == 422


def test_live_mode_requires_rotated_token_wallet_and_private_rpc() -> None:
    with pytest.raises(ValidationError, match="rotated internal service token"):
        Settings(synesis_mode="live")
