"""Ports that isolate Synesis from mech-client and external response shapes."""

from typing import Any, Protocol

from synesis_olas.models import InspectedMech, NormalizedMech


class OlasClientPort(Protocol):
    """Stable interface implemented with the pinned official mech-client."""

    def discover(self) -> tuple[NormalizedMech, ...]: ...

    def inspect_mech(self, mech: NormalizedMech) -> InspectedMech: ...

    def quote_details(self, mech: NormalizedMech, tool: str) -> tuple[str, int, dict[str, Any]]: ...

    def publish_envelope(
        self, prompt: str, tool: str, attributes: dict[str, Any]
    ) -> tuple[str, str]: ...

    def fetch_delivery(self, delivery_data: str, request_id_decimal: str) -> tuple[str, object]: ...
