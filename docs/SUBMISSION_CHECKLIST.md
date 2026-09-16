# Hackathon submission checklist

## Project claim

Synesis is a working KeeperHub integration that turns paid Olas Mech analysis
into a policy-bounded Aave V3 USDC supply on Base. KeeperHub is the sole
value-moving gateway; Synesis never holds or signs with a private key.

## Live projects and surfaces

- **KeeperHub:** Direct Execution API/gateway, organization treasury and
  execution receipts, simulation/recovery boundary, and the Aave V3 plugin.
- **Olas:** official Mech Client marketplace discovery, fixed-price USDC
  procurement, request envelopes, and IPFS delivery results.
- **Aave V3:** Base USDC supply contract call and independently observed
  position delta.
- **Base:** chain ID 8453 receipt and explorer evidence.

KeeperHub surfaces used are listed in the architecture and implementation
boundaries: `/internal/v1/keeperhub/submit-call`, receipt verification, the
organization integration readiness checks, and the versioned deployment
manifest. Olas adapter routes are documented in its [service README](../services/olas-adapter/README.md).

## Links to verify before submission

Record these from the authorized live acceptance run; never submit placeholders:

| Artifact                         | URL or ID | Verified |
| -------------------------------- | --------- | -------- |
| Deployed Synesis web app         |           | ☐        |
| Short demo video                 |           | ☐        |
| Two KeeperHub Olas execution IDs |           | ☐        |
| Two Olas delivery/IPFS links     |           | ☐        |
| KeeperHub Aave execution ID      |           | ☐        |
| Base explorer transaction links  |           | ☐        |
| Public proof verification page   |           | ☐        |
| Replay rejection event           |           | ☐        |

Run `corepack pnpm acceptance:live` with the report from the live journey. The
runner rejects wrong-chain, incomplete, duplicate, or replay-moving evidence.
Attach its output and the canonical proof JSON to the submission review.

## Security statement

Preview and demo environments use no-funds mode and isolated credentials.
Production requires protected deployment approval, encrypted secrets, private
service networking, explicit live acknowledgement, fresh authentication for
approvals, and independent receipt verification. A missing or unconfirmed
receipt is presented as unconfirmed—not success.
