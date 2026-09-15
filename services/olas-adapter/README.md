# Keyless Olas adapter

This private Python 3.11 service is Synesis's narrow boundary around the official [`mech-client`](https://github.com/valory-xyz/mech-client). The dependency is locked to `0.22.0` (official tag commit `28115ed8e88aa4bbbdde709ff14fdc63e63cef37`). It owns Olas discovery, tool/payment quotes, IPFS request envelopes, ABI request plans, and delivered-result parsing.

The process never accepts a private key. `KeeperHubExternalSigner` structurally implements the official client's external `Signer` interface: `send_transaction` forwards an unsigned Base call to Synesis's internal KeeperHub gateway and returns a transaction hash only after the gateway reports a verified successful receipt. `sign_message`, Safe-message signing, offchain requests, and Olas agent/Safe mode all fail closed in v1.

## Private API

All `/internal/v1/*` routes require `Authorization: Bearer <OLAS_ADAPTER_INTERNAL_TOKEN>`. Deploy the service only on private service networking; interactive OpenAPI routes are disabled.

| Route                                | Purpose                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `GET /health`                        | Credential-free container liveness and capability status.                    |
| `GET /internal/v1/health`            | Authenticated typed dependency/capability health.                            |
| `POST /internal/v1/quotes`           | Discover a Mech and freeze its onchain USDC rate and official tool schema.   |
| `POST /internal/v1/request-plans`    | Upload IPFS metadata and return content-hashed unsigned KeeperHub calls.     |
| `POST /internal/v1/deliveries/parse` | Resolve the official Olas result URL and validate JSON and request bindings. |

Request plans are Base-only and fixed-price USDC-only. They contain a bounded approval to the official Olas USDC balance tracker followed by one Marketplace `request(bytes,uint256,bytes32,address,uint256,bytes)` call. Each call carries a stable economic idempotency key and the current deployment-manifest reference. The KeeperHub gateway independently decodes the exact calldata before simulation or broadcast.

## Development

```powershell
python -m uv --system-certs sync --locked --all-extras --dev
python -m uv run ruff check .
python -m uv run ruff format --check .
python -m uv run mypy src tests
python -m uv run pytest
```

Set `MECHX_CHAIN_RPC` to a private Base RPC in live environments. The official client uses its Base subgraph, contract ABI, payment-type registry, tool service, and IPFS helpers behind `OfficialMechClient`; Synesis-facing models remain stable if upstream marketplace records differ from supported legacy records.
