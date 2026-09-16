# Synesis test strategy

Synesis separates deterministic contract replays from live deployment checks. No unit, contract, or CI test has a private key, KeeperHub credential, funded wallet, or public-RPC dependency; every external response is recorded or mocked.

| Boundary           | Deterministic coverage                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intent and policy  | Complete 16×16 lifecycle transition table, state metadata, per-intent/daily/strategy limits, and approval boundaries.                                                      |
| KeeperHub and Base | Recorded success, revert, delayed receipt persistence, Safe inner failure, timeout, and unconfirmed reconciliation fixtures.                                               |
| Olas and IPFS      | Recorded marketplace/legacy deployment shapes, USDC payment compatibility, frozen request plans, and JSON/IPFS delivery binding, size, staleness, and content-hash checks. |
| Aave               | Exact calldata manifest, bounded USDC approvals/supply, wrong-beneficiary rejection, and independent wallet/aUSDC delta verification.                                      |
| Security           | Calldata/schema rejection, webhook signature and replay protection, secret redaction, proof tamper detection, and cross-organization authorization checks.                 |

Run the same deterministic checks locally and in CI:

```powershell
corepack pnpm test
cd services/olas-adapter
python -m uv --system-certs run pytest
```

Live smoke checks are run only after deployment with separately provisioned, least-privilege environment variables. They use read-only health/discovery endpoints before a manually approved, policy-bounded execution is allowed.
