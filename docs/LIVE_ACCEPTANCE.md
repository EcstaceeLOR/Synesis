# Live Base acceptance

The live acceptance journey is deliberately separate from unit/CI tests. It
must be run by an authorized operator against a deployed environment with
rotated KeeperHub credentials, a funded low-value organization wallet, and a
private Base RPC. This repository does not contain those credentials and the
runner never invents receipts or broadcasts a transaction.

## Preflight and report verification

```powershell
$env:SYNESIS_MODE = "live"
$env:SYNESIS_LIVE_ACKNOWLEDGED = "I_UNDERSTAND_LIVE_VALUE_MOVEMENT"
$env:SYNESIS_API_ORIGIN = "https://api.example.com"
$env:SYNESIS_ACCEPTANCE_REPORT = "./acceptance-report.json"
corepack pnpm acceptance:live
```

The command first checks `/health`, then validates the report for all eight
required outcomes: two paid Olas requests, two verified deliveries, quorum,
bounded Aave USDC execution with an independently observed position delta, a
public proof, and a replay that moved no value. It rejects wrong-chain reports,
missing receipt evidence, duplicate transaction hashes, and any replay that was
accepted or moved value. Without a report it performs only the read-only
preflight.

`--execute` is intentionally not a broadcaster. It additionally requires
`SYNESIS_ACCEPTANCE_ALLOW=1` and documents that the approved deployment
workflow—not an ad-hoc script—must initiate the value-moving action.

The report should contain `environment: "live"`, `chainId: 8453`, `requests` and
`deliveries` arrays of length two, `quorum.passed`, `execution.strategy` equal
to `AAVE_V3_USDC_SUPPLY`, `proof` identifiers, and
`replay: { attempted: true, accepted: false, valueMoved: false }`. Keep the
report, KeeperHub receipts, Base explorer URLs, Olas delivery hashes, and the
public proof URL together as the judge-facing evidence bundle.
