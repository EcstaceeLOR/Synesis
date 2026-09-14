# KeeperHub safe execution

`@synesis/keeperhub-client` is the only package allowed to call KeeperHub write endpoints. It is a server-only boundary: API keys, raw write payloads, and network retries must not be implemented in web components, domain code, workers, or protocol adapters.

## Contract-call sequence

1. Build a `SafeContractCall` from an approved, immutable execution plan.
2. `simulateContractCall` validates the local policy before any network call and sends the canonical body with strict boolean `simulate: true`.
3. Persist the returned `SimulationEvidence`, including `payloadHash`.
4. Pass the same plan and evidence to `broadcastContractCall`. The client rebuilds the payload and refuses broadcast unless its hash equals the simulated hash.
5. Persist the stable economic `idempotencyKey` before or atomically with dispatch.
6. If KeeperHub returns a non-terminal result, call `pollExecution`. The client waits for `X-Poll-Interval-Hint` and stops only when the hint is `0`.

The canonical network body always uses numeric `chainId`, lower-case addresses, normalized decimal strings, sorted JSON object keys, a JSON-string `functionArgs`, and a JSON-string ABI. Simulation and broadcast are generated from the same immutable base object; only the simulation body has the `simulate` field.

## Fail-before-network policy

Every call must match one `ContractCallRule` across all of these dimensions:

- numeric chain ID;
- contract target;
- function name;
- four-byte selector derived with Ethereum Keccak-256 from the ABI signature;
- ABI state mutability (read functions cannot enter the write gateway);
- maximum native value in wei;
- token address at its declared target or argument position;
- maximum token amount at its declared argument position.

Protocol actions use a separate route allowlist. The chain, protocol slug, action slug, complete parameter-name set, token field, and amount field are checked before network access. KeeperHub protocol routes do not implement dry-run simulation, so they remain distinct from the two-phase contract-call API.

Issue #11 supplies versioned production rules for the exact Olas and Aave deployments. An empty rule set denies every write.

## Idempotency and pacing

Economic keys are SHA-256 digests derived from the stable task ID and canonical onchain effect. Task IDs escape `%` and `|`; chain IDs, addresses, selectors, argument hashes, values, tokens, protocol routes, and payload hashes are normalized. A retry uses the same key and exact serialized body.

The transport forwards `X-Request-Id` and `X-Trace-Id`. It reads `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After`; a `429` retry retains the identical idempotency key. Status polling follows `X-Poll-Interval-Hint`, including new status names unknown to this version of Synesis. `unconfirmed` never causes a new broadcast.

## Evidence and redaction

Returned evidence contains hashes, request/trace IDs, non-secret pacing metadata, execution IDs, and the KeeperHub response. The optional logger receives only the operation, hashes, IDs, HTTP status, and execution ID. It never receives the API key, Authorization header, ABI, arguments, token amounts, or upstream response body.

These rules implement KeeperHub's current official [safe first-write sequence, idempotency guidance, simulation contract, and header-driven polling](https://docs.keeperhub.com/api/direct-execution). ABI selectors use the audited [`@noble/hashes` Keccak-256 implementation](https://github.com/paulmillr/noble-hashes#sha3-fips-shake-keccak).
