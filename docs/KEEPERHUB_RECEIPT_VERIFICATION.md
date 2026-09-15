# KeeperHub receipt verification

Synesis does not treat HTTP acceptance, `status: completed`, or a transaction hash as proof of value movement. `ReceiptVerificationClient` reconciles the original KeeperHub execution ID with an independent Base mainnet RPC receipt. It has no broadcast method, and every result sets `rebroadcastAllowed: false`.

## Verification contract

For each reconciliation cycle, Synesis:

1. reads exactly one status snapshot for the existing KeeperHub execution ID;
2. extracts KeeperHub's explicit `verified` and `receiptStatus` assertions;
3. verifies that the independent RPC identifies itself as Base mainnet (`8453`);
4. reads `eth_getTransactionReceipt` for KeeperHub's transaction hash;
5. normalizes transaction hash, block identity, transaction position, sender, recipient, gas fields, status, and logs;
6. hashes the normalized KeeperHub and RPC receipt fields independently;
7. accepts success only when both hashes agree, the outer receipt succeeded, any required Safe success event is present, `verified === true`, and `receiptStatus === "success"`.

The canonical hash is SHA-256 over sorted JSON and is safe to place in logs and proof bundles. Raw provider payloads are not logged.

## Classifications

| Classification       | Intent disposition | Meaning                                                                 |
| -------------------- | ------------------ | ----------------------------------------------------------------------- |
| `VERIFIED_SUCCESS`   | `SUCCEEDED`        | KeeperHub's explicit verification and the independent receipt agree.    |
| `REVERTED`           | `FAILED`           | The independently verified outer transaction reverted.                  |
| `SAFE_INNER_FAILURE` | `FAILED`           | The expected Safe emitted `ExecutionFailure` despite outer status `1`.  |
| `EVIDENCE_MISMATCH`  | `FAILED`           | Chain, execution, transaction, or canonical receipt evidence disagrees. |
| `UNCONFIRMED`        | `UNCONFIRMED`      | Required evidence is incomplete before the deadline.                    |
| `TIMED_OUT`          | `FAILED`           | Required evidence is still incomplete after the deadline.               |

An `UNCONFIRMED` result freezes the intent and returns only `RECONCILE_SAME_EXECUTION`. A later cycle reads the same KeeperHub execution ID; it never submits another economic action. This handles delayed KeeperHub or RPC persistence without risking a duplicate payment.

## Safe transactions

When a Safe address is expected, Synesis derives the official `ExecutionSuccess(bytes32,uint256)` and `ExecutionFailure(bytes32,uint256)` event topics with Keccak-256. Only logs emitted by the configured Safe are considered. An outer EVM success cannot hide an inner Safe failure, and the success event is required unless the caller explicitly disables that requirement for a known direct-call flow.

The status and recovery semantics follow KeeperHub's official [Direct Execution API](https://docs.keeperhub.com/api/direct-execution) and [execution recovery contract](https://docs.keeperhub.com/cli/execution-recovery). Independent receipt reads follow Base's standard Ethereum JSON-RPC interface.
