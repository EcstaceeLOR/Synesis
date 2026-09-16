# Synesis Epic completion

This document is the release checklist for **[EPIC] Ship the complete live
Synesis product**. Every implementation issue is merged to `main`; the links
below are the durable source of truth for the shipped behavior.

## Implementation checklist

- [x] #2–#5 workspace, domain contracts, PostgreSQL persistence, and durable coordinator
- [x] #6–#8 authentication/RBAC, product shell, and integration onboarding
- [x] #9–#11 KeeperHub safe execution, receipt recovery, and deployment manifest
- [x] #12–#16 keyless Olas adapter, live discovery, procurement, webhooks, and delivery validation
- [x] #17–#19 quorum, spending limits/pause, and bounded Aave execution
- [x] #20–#24 command center, intent wizard/room, execution/treasury views, and public proofs
- [x] #25–#27 observability, deterministic integration tests, and Playwright/replay journeys
- [x] #28 deployment topology, live-mode acknowledgement gate, and protected CI/CD
- [x] #29 fail-closed live acceptance runner and eight-part evidence validation
- [x] #30 judge demo, submission checklist, and incident/runbook documentation

## Definition-of-done evidence

- Multi-page web surfaces are backed by typed API/data boundaries and persisted
  PostgreSQL lifecycle state; the browser suite exercises navigation, refresh,
  approval idempotency, accessibility, and failure artifacts.
- KeeperHub remains the only value-moving gateway. Safe execution binds the
  simulation payload, economic idempotency key, allowlist, and receipt before
  an action is considered complete.
- Olas responses are untrusted evidence. Two independent, schema-pinned
  deliveries feed deterministic quorum; IPFS content hashes, request IDs, and
  freshness are validated before execution.
- Canonical proof bundles connect requests, deliveries, policy/quorum,
  KeeperHub receipts, and observed Aave state. The public verifier recomputes
  every entry hash and the ordered root independently.
- Duplicate webhook, job, approval, or replay attempts are recorded and cannot
  create a second economic action.

## Release gate

The codebase is production-shaped and all deterministic gates pass in CI. The
actual low-value Base mainnet run is intentionally operator-gated: it requires
rotated credentials, a funded organization wallet, private Base RPC access,
and `SYNESIS_LIVE_ACKNOWLEDGED=I_UNDERSTAND_LIVE_VALUE_MOVEMENT`. Run
`corepack pnpm acceptance:live` against the deployed API with the resulting
report before submitting live transaction IDs or proof links. No transaction
or fabricated evidence is accepted as a substitute for that authorized run.
