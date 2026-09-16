# Synesis observability runbook

All alerts are investigated by trace ID. Never retry a value-moving action with a new economic idempotency key.

| Alert                  | Investigation                                                           | Safe recovery                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `INTEGRATION_DEGRADED` | Inspect dependency health and the latest credential-safe health check.  | Restore the dependency, rerun the read-only health check, then resume queued work.                                               |
| `INTENT_STUCK`         | Locate the intent and its last persisted state transition/outbox job.   | Run reconciliation for the same state version; do not manually advance state.                                                    |
| `UNEXPECTED_CALL`      | Compare chain, target, selector, amount, and manifest version.          | Keep execution paused, rotate compromised credentials if indicated, and create a new audited manifest version only after review. |
| `WRITE_UNCONFIRMED`    | Reconcile the same KeeperHub execution ID against independent Base RPC. | Never rebroadcast; wait for confirmation or classify the intent failed/unconfirmed from canonical receipt evidence.              |
| `LOW_BALANCE`          | Verify the block-tagged ETH/USDC snapshot and policy capacity.          | Replenish the organization wallet through an approved external process; recheck balances before resuming.                        |
| `PROOF_MISMATCH`       | Recalculate every public entry hash and the ordered root.               | Quarantine the bundle, preserve source evidence, rebuild deterministically, and never publish the mismatched proof.              |

Metrics cover active intents by state, lifecycle latency, Mech delivery and schema validity, quorum outcomes, KeeperHub outcomes, duplicate suppression, treasury balance, and remaining capacity.

## Incident boundaries

Pause new approvals when any critical alert is active. Preserve the original
trace ID, intent ID, economic idempotency key, receipt payload, and proof
inputs before attempting recovery. Only read-only health, receipt
reconciliation, and proof verification are safe during an incident; never
retry a value-moving call with a new key. If credentials, a manifest, or a
receipt may be compromised, revoke/rotate the affected integration and require
fresh owner approval before resuming. A post-incident report must include the
timeline, impacted intents, duplicate-suppression result, final treasury and
position deltas, and the exact recovery commands used.
