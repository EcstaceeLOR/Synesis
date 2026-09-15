"""Narrow integration with the pinned official Olas mech-client."""

import importlib
import importlib.metadata
from dataclasses import asdict
from typing import Any, cast

from synesis_olas.errors import AdapterError
from synesis_olas.models import NormalizedMech
from synesis_olas.normalization import normalize_discovery

PINNED_MECH_CLIENT_VERSION = "0.22.0"


def installed_mech_client_version() -> str:
    """Read distribution metadata without importing its signing dependency graph."""

    try:
        return importlib.metadata.version("mech-client")
    except importlib.metadata.PackageNotFoundError:
        return "not-installed"


class OfficialMechClient:
    """Adapter over public config/tool/IPFS APIs and the official IMech ABI."""

    def __init__(self) -> None:
        version = installed_mech_client_version()
        if version != PINNED_MECH_CLIENT_VERSION:
            raise AdapterError(
                "MECH_CLIENT_VERSION_MISMATCH",
                f"Expected mech-client {PINNED_MECH_CLIENT_VERSION}, found {version}",
                503,
            )

    @staticmethod
    def _module(name: str) -> Any:
        return importlib.import_module(name)

    def discover(self) -> tuple[NormalizedMech, ...]:
        queries = self._module("mech_client.infrastructure.subgraph.queries")
        try:
            payload = queries.query_mm_mechs_info("base")
            return normalize_discovery(payload or ())
        except AdapterError:
            raise
        except Exception as exc:
            raise AdapterError(
                "OLAS_DISCOVERY_FAILED", "Official Olas discovery failed", 502
            ) from exc

    def create_keyless_marketplace_service(self, signer: object) -> Any:
        """Bind the official MarketplaceService to Synesis's external signer."""

        mech_client = self._module("mech_client")
        return mech_client.MarketplaceService(
            chain_config="base",
            agent_mode=False,
            signer=signer,
        )

    def quote_details(self, mech: NormalizedMech, tool: str) -> tuple[str, int, dict[str, Any]]:
        """Read payment facts with official config, ABI, contracts, and ToolService."""

        try:
            config_module = self._module("mech_client.infrastructure.config")
            blockchain = self._module("mech_client.infrastructure.blockchain.contracts")
            abi_loader = self._module("mech_client.infrastructure.blockchain.abi_loader")
            ethereum = self._module("aea_ledger_ethereum")
            tool_module = self._module("mech_client.services.tool_service")
            config = config_module.get_mech_config("base")
            ledger = ethereum.EthereumApi(**asdict(config.ledger_config))
            contract = blockchain.get_contract(
                mech.address, abi_loader.get_abi("IMech.json"), ledger
            )
            payment_bytes = contract.functions.paymentType().call()
            payment = config_module.PaymentType.from_value(payment_bytes.hex())
            service_id = int(contract.functions.serviceId().call())
            if service_id != mech.service_id:
                raise AdapterError(
                    "MECH_IDENTITY_MISMATCH",
                    "Onchain service ID does not match discovery",
                    409,
                )
            rate = int(contract.functions.maxDeliveryRate().call())
            schema = cast(
                dict[str, Any], tool_module.ToolService("base").get_schema(f"{service_id}-{tool}")
            )
            return payment.name, rate, schema
        except AdapterError:
            raise
        except Exception as exc:
            raise AdapterError(
                "OLAS_QUOTE_FAILED", "Official Olas quote lookup failed", 502
            ) from exc

    def publish_envelope(
        self, prompt: str, tool: str, attributes: dict[str, Any]
    ) -> tuple[str, str]:
        metadata = self._module("mech_client.infrastructure.ipfs.metadata")
        try:
            request_data, cid_hex = metadata.push_metadata_to_ipfs(prompt, tool, attributes)
            return str(request_data), str(cid_hex)
        except Exception as exc:
            raise AdapterError(
                "IPFS_UPLOAD_FAILED", "Official Olas IPFS upload failed", 502
            ) from exc

    def fetch_delivery(self, delivery_data: str, request_id_decimal: str) -> tuple[str, object]:
        result_file = self._module("mech_client.infrastructure.ipfs.result_file")
        url = str(
            result_file.build_result_file_url(delivery_data.removeprefix("0x"), request_id_decimal)
        )
        try:
            return url, result_file.fetch_result_file(url, request_id=request_id_decimal)
        except Exception as exc:
            raise AdapterError(
                "IPFS_DELIVERY_FAILED", "Official Olas delivery fetch failed", 502
            ) from exc
