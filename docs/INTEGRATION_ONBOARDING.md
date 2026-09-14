# Integration onboarding

`/app/settings/integrations` is Synesis' fail-closed control plane for the live execution stack. The organization cannot become `READY` unless every required check passes in the same run.

## Required checks

1. KeeperHub accepts the `kh_` organization key through authenticated `GET /api/keys`.
2. `GET /api/user/wallet` returns a valid organization EVM signer.
3. KeeperHub's live chain catalog reports Base mainnet (`8453`) enabled.
4. The configured RPC reports Base chain ID and a current block.
5. ETH and Base USDC balances are read from that signer without a write.
6. The official Olas Mech Marketplace and metadata contracts contain bytecode.
7. The live Olas Base subgraph exposes at least two Mechs with deliveries from official supported factories.
8. The IPFS gateway resolves a pinned Olas CID.
9. The delivery endpoint acknowledges an HMAC-signed probe whose payload states `chainWrite: false`.

Health results are organization-scoped, timestamped, actionable, and persisted. A failed or missing result sets the organization to `NOT_READY` and clears `integrations_ready_at`.

## Credential boundary

The web form is a Next.js server action. It forwards secrets once to the API and never includes them in returned state, URLs, health details, audit events, or browser storage. The API validates TLS endpoints, then encrypts the complete configuration using AES-256-GCM with organization-bound additional authenticated data. PostgreSQL stores ciphertext, a unique nonce, an authentication tag, and a non-secret `vault://` reference only.

Set `SYNESIS_SECRET_ENCRYPTION_KEY` to a stable base64-encoded 32-byte key. Rotating it requires decrypting and re-encrypting existing rows under a new `key_version`; replacing it without migration intentionally makes old ciphertext unreadable.

## Safety

Onboarding calls only HTTP reads, `eth_chainId`, `eth_blockNumber`, `eth_getBalance`, `eth_call`, and `eth_getCode`. It does not call KeeperHub execution endpoints, sign transactions, approve tokens, or broadcast value movement. The webhook probe is the sole outgoing POST beyond RPC/GraphQL and carries no credential material.

KeeperHub endpoint semantics follow its official [authentication](https://docs.keeperhub.com/api/authentication), [user wallet](https://docs.keeperhub.com/api/user), and [chains](https://docs.keeperhub.com/api/chains) references. Olas addresses, factory compatibility, and discovery query track the official [mech-client configuration](https://github.com/valory-xyz/mech-client/blob/main/mech_client/configs/mechs.json) and [subgraph client](https://github.com/valory-xyz/mech-client/blob/main/mech_client/infrastructure/subgraph/client.py).
