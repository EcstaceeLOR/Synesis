"""Domain tests for normalized, keyless Olas planning."""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from eth_abi.abi import default_codec

from synesis_olas.errors import AdapterError, DisabledCapabilityError
from synesis_olas.models import (
    DeliveryRequest,
    FreezeMechSelectionRequest,
    InspectedMech,
    MechKind,
    MechSelection,
    NormalizedMech,
    QuoteRequest,
    RequestPlanRequest,
)
from synesis_olas.normalization import normalize_discovery, normalize_mech
from synesis_olas.service import (
    OLAS_MARKETPLACE,
    OLAS_USDC_BALANCE_TRACKER,
    USDC_ADDRESS,
    OlasAdapterService,
)

MECH = "0x1111111111111111111111111111111111111111"
FACTORY = "0x97371b1c0cda1d04dfc43dfb50a04645b7bc9bee"
PAYER = "0x3333333333333333333333333333333333333333"
REQUEST_ID = "0x" + "44" * 32
DELIVERY_DATA = "0x" + "55" * 32
REQUEST_DATA = "0x" + "66" * 32
CID_HEX = "f01701220" + "66" * 32
NOW = datetime(2026, 9, 15, 1, 0, tzinfo=UTC)


class FakeOlasClient:
    def __init__(self, *, payment: str = "USDC_TOKEN", rate: int = 125_000) -> None:
        self.payment = payment
        self.rate = rate
        self.delivery: object = {"request_id": REQUEST_ID, "recommendation": "supply"}
        self.attributes: dict[str, Any] = {}
        self.request_data = REQUEST_DATA
        self.cid_hex = CID_HEX
        self.mechs: tuple[NormalizedMech, ...] = (
            NormalizedMech(
                address=MECH,
                service_id=1722,
                factory_address=FACTORY,
                kind=MechKind.MARKETPLACE,
                total_deliveries=42,
                tools=("prediction-request",),
                metadata_cid="f01701220" + "77" * 32,
            ),
        )

    def discover(self) -> tuple[NormalizedMech, ...]:
        return self.mechs

    def inspect_mech(self, mech: NormalizedMech) -> InspectedMech:
        return InspectedMech(
            contract_active=True,
            onchain_service_id=mech.service_id,
            payment_type=self.payment,
            unit_amount=self.rate,
            name="Test risk Mech",
            description="A deterministic fixture backed by a fake port.",
            tool_schemas={
                "prediction-request": {
                    "description": "Return one decision",
                    "input": {"type": "string"},
                    "output": {"type": "object"},
                }
            },
        )

    def quote_details(self, _mech: NormalizedMech, tool: str) -> tuple[str, int, dict[str, Any]]:
        if tool != "prediction-request":
            raise AdapterError("TOOL_NOT_FOUND", "Tool not found", 404)
        return self.payment, self.rate, {"name": tool, "input": {"type": "string"}}

    def publish_envelope(
        self, _prompt: str, _tool: str, _attributes: dict[str, Any]
    ) -> tuple[str, str]:
        self.attributes = _attributes
        return self.request_data, self.cid_hex

    def fetch_delivery(self, delivery_data: str, request_id_decimal: str) -> tuple[str, object]:
        assert delivery_data == DELIVERY_DATA
        assert request_id_decimal == str(int(REQUEST_ID, 16))
        return f"https://gateway.autonolas.tech/ipfs/{CID_HEX}/{request_id_decimal}", self.delivery


def service(client: FakeOlasClient | None = None) -> OlasAdapterService:
    return OlasAdapterService(client or FakeOlasClient(), now=lambda: NOW)


def test_normalizes_marketplace_and_legacy_shapes() -> None:
    marketplace = normalize_mech(
        {
            "address": MECH,
            "mechFactory": FACTORY,
            "totalDeliveriesTransactions": "42",
            "service": {
                "id": "1722",
                "metadata": {"metadata": {"tools": ["prediction-request"]}},
            },
        }
    )
    legacy = normalize_mech(
        {
            "agentAddress": MECH,
            "factoryAddress": FACTORY,
            "serviceId": 1722,
            "totalDeliveries": 7,
            "tools": ["prediction-request"],
        }
    )

    assert marketplace.kind is MechKind.MARKETPLACE
    assert legacy.kind is MechKind.LEGACY
    assert marketplace.address == legacy.address == MECH
    assert normalize_discovery({"meches": [marketplace.model_dump()]})[0].service_id == 1722


def test_replays_recorded_deployment_and_payment_contract_fixtures() -> None:
    fixture_path = Path(__file__).parent / "fixtures" / "olas-contract-fixtures.json"
    fixtures = json.loads(fixture_path.read_text(encoding="utf-8"))

    for fixture in fixtures["deploymentShapes"]:
        normalized = normalize_mech(fixture["record"])
        assert normalized.kind.value == fixture["kind"]
        assert normalized.address == MECH
        assert normalized.service_id == 1722

    for fixture in fixtures["paymentShapes"]:
        adapter = service(FakeOlasClient(payment=fixture["payment"]))
        if fixture["supported"]:
            assert (
                adapter.quote(
                    QuoteRequest(mech_address=MECH, tool="prediction-request")
                ).payment_type
                == fixture["payment"]
            )
        else:
            with pytest.raises(AdapterError, match="fixed-price USDC"):
                adapter.quote(QuoteRequest(mech_address=MECH, tool="prediction-request"))


def test_invalid_discovery_fails_closed() -> None:
    with pytest.raises(AdapterError, match="invalid shape"):
        normalize_discovery({"meches": "not-a-list"})
    with pytest.raises(AdapterError, match="invalid Mech"):
        normalize_mech({"address": "not-an-address", "serviceId": 1})


def test_quote_uses_live_mech_facts_and_caps_rate() -> None:
    result = service().quote(QuoteRequest(mech_address=MECH, tool="prediction-request"))

    assert result.payment_type == "USDC_TOKEN"
    assert result.maximum_amount == 125_000
    assert result.approval_spender.lower() == OLAS_USDC_BALANCE_TRACKER
    assert result.expires_at.isoformat() == "2026-09-15T01:01:00+00:00"

    with pytest.raises(AdapterError, match="between 1 and"):
        service(FakeOlasClient(rate=1_000_001)).quote(
            QuoteRequest(mech_address=MECH, tool="prediction-request")
        )
    with pytest.raises(AdapterError, match="fixed-price USDC"):
        service(FakeOlasClient(payment="NATIVE")).quote(
            QuoteRequest(mech_address=MECH, tool="prediction-request")
        )


def test_discovery_scores_and_freezes_live_versions() -> None:
    fake = FakeOlasClient()
    second = fake.mechs[0].model_copy(
        update={
            "address": "0x4444444444444444444444444444444444444444",
            "service_id": 1723,
            "metadata_cid": "f01701220" + "88" * 32,
        }
    )
    fake.mechs = (fake.mechs[0], second)
    adapter = service(fake)

    directory = adapter.discover_directory()
    assert directory.status == "ready"
    assert all(mech.eligible for mech in directory.mechs)
    assert directory.mechs[0].tools[0].schema_hash.startswith("sha256:")

    frozen = adapter.freeze_mech_selections(
        FreezeMechSelectionRequest(
            selections=(
                MechSelection(mech_address=MECH, tool="prediction-request"),
                MechSelection(mech_address=second.address, tool="prediction-request"),
            )
        )
    )
    assert frozen.snapshot_hash.startswith("sha256:")
    assert frozen.selections[0].metadata_cid == "f01701220" + "77" * 32
    assert frozen.selections[0].observed_version == "base-2026-09-15.2"


def test_discovery_rejects_incompatible_and_degraded_mechs_without_fabrication() -> None:
    fake = FakeOlasClient(payment="NATIVE")
    directory = service(fake).discover_directory()

    assert len(directory.mechs) == 1
    assert directory.mechs[0].eligible is False
    assert "PAYMENT_TYPE_UNSUPPORTED" in {reason.code for reason in directory.mechs[0].reasons}

    fake.mechs = ()
    empty = service(fake).discover_directory()
    assert empty.status == "empty"
    assert empty.mechs == ()


def test_request_plan_is_bound_to_ipfs_quote_manifest_and_intent() -> None:
    request = RequestPlanRequest(
        economic_intent_id="intent_123",
        mech_address=MECH,
        payer_address=PAYER,
        prompt="Return a strict Aave USDC recommendation.",
        tool="prediction-request",
    )
    fake = FakeOlasClient()
    adapter = service(fake)
    first = adapter.create_request_plan(request)
    nonce = fake.attributes["nonce"]
    second = adapter.create_request_plan(request)

    assert first.plan_hash == second.plan_hash
    assert fake.attributes["nonce"] == nonce
    assert str(nonce).startswith("sha256:")
    assert first.envelope.request_data == REQUEST_DATA
    assert first.calls[0].to.lower() == USDC_ADDRESS
    assert first.calls[1].to.lower() == OLAS_MARKETPLACE
    assert first.disabled_modes == ("sign_message", "offchain", "agent", "safe")

    spender, amount = default_codec.decode(
        ["address", "uint256"], bytes.fromhex(first.calls[0].data[10:])
    )
    assert spender.lower() == OLAS_USDC_BALANCE_TRACKER
    assert amount == 125_000
    request_data, rate, _payment, mech, timeout, payment_data = default_codec.decode(
        ["bytes", "uint256", "bytes32", "address", "uint256", "bytes"],
        bytes.fromhex(first.calls[1].data[10:]),
    )
    assert request_data == bytes.fromhex(REQUEST_DATA[2:])
    assert rate == 125_000
    assert mech.lower() == MECH
    assert timeout == 300
    assert payment_data == b""


def test_utf8_prompt_limit_and_modes_fail_closed() -> None:
    with pytest.raises(AdapterError, match="UTF-8"):
        service().create_request_plan(
            RequestPlanRequest(
                economic_intent_id="intent_oversize",
                mech_address=MECH,
                payer_address=PAYER,
                prompt="€" * 3000,
                tool="prediction-request",
            )
        )
    with pytest.raises(DisabledCapabilityError, match="offchain"):
        service().assert_v1_mode(offchain=True)
    with pytest.raises(DisabledCapabilityError, match="Safe/agent"):
        service().assert_v1_mode(agent_mode=True)

    fake = FakeOlasClient()
    fake.request_data = "0xnot-hex"
    with pytest.raises(AdapterError, match="invalid request data hash"):
        service(fake).create_request_plan(
            RequestPlanRequest(
                economic_intent_id="intent_bad_ipfs",
                mech_address=MECH,
                payer_address=PAYER,
                prompt="prompt",
                tool="prediction-request",
            )
        )


def test_delivery_is_json_size_limited_and_request_bound() -> None:
    fake = FakeOlasClient()
    result = service(fake).parse_delivery(
        DeliveryRequest(
            request_id=REQUEST_ID,
            delivery_data=DELIVERY_DATA,
            expected_mech=MECH,
        )
    )
    assert result.payload["recommendation"] == "supply"
    assert result.content_hash.startswith("sha256:")

    fake.delivery = {"request_id": "0x" + "99" * 32}
    with pytest.raises(AdapterError, match="different request"):
        service(fake).parse_delivery(
            DeliveryRequest(
                request_id=REQUEST_ID,
                delivery_data=DELIVERY_DATA,
                expected_mech=MECH,
            )
        )
    fake.delivery = "free-form executable-looking text"
    with pytest.raises(AdapterError, match="JSON object"):
        service(fake).parse_delivery(
            DeliveryRequest(
                request_id=REQUEST_ID,
                delivery_data=DELIVERY_DATA,
                expected_mech=MECH,
            )
        )
