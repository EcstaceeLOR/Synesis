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
