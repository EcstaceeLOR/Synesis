"""Normalize current marketplace and supported legacy discovery records."""

from collections.abc import Mapping, Sequence
from typing import Any

from pydantic import ValidationError

from synesis_olas.errors import AdapterError
from synesis_olas.models import MechKind, NormalizedMech, normalize_hex


def _mapping(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _integer(*values: object, default: int = 0) -> int:
    for value in values:
        if isinstance(value, int) and not isinstance(value, bool):
            return value
        if isinstance(value, str) and value.isdecimal():
            return int(value)
    return default


def _tools(record: Mapping[str, Any], service: Mapping[str, Any]) -> tuple[str, ...]:
    metadata_wrapper = _mapping(service.get("metadata"))
    metadata = _mapping(metadata_wrapper.get("metadata"))
    candidates = record.get("tools", metadata.get("tools", ()))
    if not isinstance(candidates, Sequence) or isinstance(candidates, str | bytes):
        return ()
    return tuple(item for item in candidates if isinstance(item, str) and item)


def normalize_mech(record: Mapping[str, Any]) -> NormalizedMech:
    """Collapse Olas marketplace and legacy aliases into one strict model."""

    service = _mapping(record.get("service"))
    is_marketplace = bool(service) or "mechFactory" in record
    address = record.get("address", record.get("agentAddress", record.get("mech")))
    factory = record.get("mechFactory", record.get("factoryAddress"))
    service_id = _integer(service.get("id"), record.get("serviceId"), record.get("service_id"))
    deliveries = _integer(
        record.get("totalDeliveriesTransactions"),
        service.get("totalDeliveries"),
        record.get("totalDeliveries"),
    )
    try:
        return NormalizedMech(
            address=normalize_hex(str(address)),
            service_id=service_id,
            factory_address=normalize_hex(str(factory)) if factory else None,
            kind=MechKind.MARKETPLACE if is_marketplace else MechKind.LEGACY,
            total_deliveries=deliveries,
            tools=_tools(record, service),
        )
    except ValidationError as exc:
        raise AdapterError(
            "INVALID_MECH_RECORD", "Olas returned an invalid Mech record", 502
        ) from exc


def normalize_discovery(payload: object) -> tuple[NormalizedMech, ...]:
    """Normalize a list or the official subgraph's `meches` wrapper."""

    records = payload.get("meches") if isinstance(payload, Mapping) else payload
    if not isinstance(records, Sequence) or isinstance(records, str | bytes):
        raise AdapterError("INVALID_DISCOVERY", "Olas discovery returned an invalid shape", 502)
    normalized: list[NormalizedMech] = []
    for record in records:
        if isinstance(record, Mapping):
            normalized.append(normalize_mech(record))
    return tuple(normalized)
