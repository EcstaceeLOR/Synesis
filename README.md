# Synesis

**Paid intelligence. Proven execution.**

Synesis is an agent procurement and deterministic onchain execution platform. It pays live Olas Mech agents for independent analysis, evaluates their responses with a versioned policy, and uses KeeperHub to simulate, execute, and prove a bounded transaction through Aave V3 on Base.

## Live demo

[Open Synesis](https://synesis-web.vercel.app/)

- **Interactive product:** [synesis-web.vercel.app](https://synesis-web.vercel.app/)
- **Deployed backend health:** [synesis-web.vercel.app/api/v1/status](https://synesis-web.vercel.app/api/v1/status)
- **Public proof:** [Verify PRF-1041](https://synesis-web.vercel.app/verify/PRF-1041)

The Vercel deployment includes a serverless backend-for-frontend for the complete
interactive demo: Olas Mech discovery, bounded intent creation, idempotent
approval, exact-call simulation, emergency pause, activity streaming, and
canonical proof download. Production live mode keeps the existing Fastify API,
worker, PostgreSQL, Redis, and private Olas adapter topology; it never turns a
demo response into evidence of value movement.

Anonymous visitors can explore every application surface while the deployment
is in its default, no-funds `demo` mode. Setting `SYNESIS_MODE=live` restores
the fail-closed OIDC session boundary before any live integration can run.

## Core lifecycle

```text
Create intent
  -> procure two Olas Mech recommendations through KeeperHub
  -> receive confirmed Olas deliveries
  -> evaluate deterministic quorum
  -> simulate and execute an Aave action through KeeperHub
  -> publish a verifiable evidence bundle
```

## Project status

Synesis is under active development for the KeeperHub Agent Economy Hackathon. The repository begins with the approved architecture and an issue-driven implementation plan. Live mode will not substitute mock transactions or treat an unverified transaction hash as success.

## Workspace

The monorepo uses Node 24, pnpm 10, Turborepo, TypeScript in strict mode, and an
isolated Python 3.11 service for Olas. From a clean checkout:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

The web app runs on `http://localhost:3000`, the API on `http://localhost:4000`,
and the Olas adapter on `http://localhost:8100`. Copy `.env.example` only when
you need to override the safe demo defaults.

Run every Node quality gate with:

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

The Olas adapter is locked and checked separately:

```powershell
Set-Location services/olas-adapter
uv sync --locked --all-extras --dev
uv run ruff check .
uv run ruff format --check .
uv run mypy src tests
uv run pytest
```

For a fully provisioned local stack with PostgreSQL, Redis, API, worker, and
Olas adapter, use the [deployment guide](deploy/README.md). It defaults to
no-funds demo mode and fails closed if live acknowledgement is missing.

## Architecture

Read the complete [system architecture](docs/ARCHITECTURE.md), including:

- the multi-page product experience;
- KeeperHub and Olas integration boundaries;
- the persisted intent state machine;
- security and replay protection;
- proof generation and independent verification;
- deployment, testing, and live acceptance requirements.

The implementation checklist and release gate are tracked in
[EPIC_STATUS.md](docs/EPIC_STATUS.md).

## Initial product journey

The first production journey is intentionally constrained to Base mainnet, USDC, two compatible Olas Mechs, and an Aave V3 USDC supply action. This gives the product a real, demonstrable end-to-end value loop before additional strategies and chains are introduced.

## Judge walkthrough

1. Open the command center and confirm the backend-connected indicator.
2. Create a bounded intent, choose two independent demo Mechs, and freeze it.
3. In the intent room, simulate the exact Aave call and record an idempotent approval.
4. Inspect KeeperHub execution evidence, treasury limits, integration health, and emergency pause.
5. Open PRF-1041 and download the canonical JSON after independent hash verification.

## Safety

- KeeperHub is the only transaction signing and broadcasting path.
- Synesis stores no wallet private keys.
- Mech responses are untrusted evidence, never transaction instructions.
- Every write uses stable economic idempotency and receipt verification.
- Contract targets, selectors, amounts, and chain IDs are allowlisted and capped.

See [integration onboarding](docs/INTEGRATION_ONBOARDING.md) for the live dependency checks, encrypted credential boundary, and readiness gate.

The authorized low-value Base acceptance procedure is documented in
[LIVE_ACCEPTANCE.md](docs/LIVE_ACCEPTANCE.md). The four-minute judge flow and
final artifact checklist are in [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) and
[SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md).

All KeeperHub writes must use the [safe-execution client](docs/KEEPERHUB_SAFE_EXECUTION.md), which binds simulation to broadcast with canonical payload hashes and fail-before-network allowlists.

Completed writes pass through [independent receipt verification](docs/KEEPERHUB_RECEIPT_VERIFICATION.md), which freezes unconfirmed intents, reconciles the same execution ID, and requires KeeperHub and Base receipt hashes to agree.

Every value-moving call must also match the [versioned Base deployment manifest](docs/DEPLOYMENT_MANIFEST.md), including pinned proxy implementations, bytecode hashes, exact ABI selectors, and hard spending bounds.

The private [keyless Olas adapter](services/olas-adapter/README.md) pins the official Mech Client, normalizes current and legacy Mechs, publishes request envelopes, and produces KeeperHub-only transaction plans without exposing a signing key.

The live Mech marketplace is served from `GET /api/v1/mechs`. It preserves ineligible onchain providers with machine-readable reasons, exposes immutable tool-schema hashes, and refuses to fabricate demo fallbacks. Intent selections bind two distinct addresses to their metadata CIDs and observed manifest version before procurement begins.
