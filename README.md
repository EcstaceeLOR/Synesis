# Synesis

**Paid intelligence. Proven execution.**

Synesis is an agent procurement and deterministic onchain execution platform. It pays live Olas Mech agents for independent analysis, evaluates their responses with a versioned policy, and uses KeeperHub to simulate, execute, and prove a bounded transaction through Aave V3 on Base.

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

## Architecture

Read the complete [system architecture](docs/ARCHITECTURE.md), including:

- the multi-page product experience;
- KeeperHub and Olas integration boundaries;
- the persisted intent state machine;
- security and replay protection;
- proof generation and independent verification;
- deployment, testing, and live acceptance requirements.

## Initial product journey

The first production journey is intentionally constrained to Base mainnet, USDC, two compatible Olas Mechs, and an Aave V3 USDC supply action. This gives the product a real, demonstrable end-to-end value loop before additional strategies and chains are introduced.

## Safety

- KeeperHub is the only transaction signing and broadcasting path.
- Synesis stores no wallet private keys.
- Mech responses are untrusted evidence, never transaction instructions.
- Every write uses stable economic idempotency and receipt verification.
- Contract targets, selectors, amounts, and chain IDs are allowlisted and capped.

