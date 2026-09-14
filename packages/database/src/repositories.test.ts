import type { IntentStateTransition } from "@synesis/domain";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asEncryptedSecretReference,
  createSynesisStore,
  migrate,
  rollback,
  seedDevelopmentFixtures,
  type SynesisStore,
} from "./index.js";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

describe("credential references", () => {
  it("rejects plaintext integration credentials", () => {
    expect(() => asEncryptedSecretReference("keeperhub-api-key")).toThrow(
      "must be an encrypted",
    );
    expect(asEncryptedSecretReference("vault://synesis/keeperhub")).toBe(
      "vault://synesis/keeperhub",
    );
  });

  it("blocks development seed data in live mode", async () => {
    await expect(
      seedDevelopmentFixtures({
        connectionString: "postgresql://unused",
        mode: "live",
      }),
    ).rejects.toThrow("cannot be loaded in live mode");
  });
});

describe.skipIf(!databaseUrl)("PostgreSQL persistence", () => {
  let store: SynesisStore;

  beforeAll(async () => {
    await rollback({ connectionString: databaseUrl!, steps: "all" });
    await migrate({ connectionString: databaseUrl! });
    await seedDevelopmentFixtures({
      connectionString: databaseUrl!,
      mode: "demo",
    });
    store = createSynesisStore({
      connectionString: databaseUrl!,
      maxConnections: 2,
    });

    await store.transaction(async (repositories) => {
      await repositories.mechs.create({
        id: "test_mech",
        chainId: 8453,
        address: "0x0000000000000000000000000000000000000001",
        serviceId: "test-service",
        paymentType: "native",
        status: "active",
        observedAt: "2026-09-14T10:00:00.000Z",
      });
      await repositories.intents.create({
        id: "test_intent",
        organizationId: "dev_org_synesis",
        state: "DRAFT",
        stateVersion: 0,
        strategy: "AAVE_V3_USDC_SUPPLY",
        amount: "1000000",
        chainId: 8453,
        snapshotHash: `sha256:${"0".repeat(64)}`,
        policyVersionId: "dev_policy_guardrails_v1",
        expiresAt: "2026-09-15T10:00:00.000Z",
      });
      await repositories.intentMechs.create({
        id: "test_intent_mech",
        intentId: "test_intent",
        mechId: "test_mech",
        toolId: "risk-analysis",
        quotedPrice: "10",
        requestCid: "bafy-test-request",
      });
    });
  });

  afterAll(async () => {
    await store.close();
    await rollback({ connectionString: databaseUrl!, steps: "all" });
  });

  it("round-trips the complete schema with explicit down and up migrations", async () => {
    await store.close();
    await rollback({ connectionString: databaseUrl!, steps: "all" });

    const pool = new Pool({ connectionString: databaseUrl!, max: 1 });
    const empty = await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE 'pg_%'
    `);
    expect(empty.rows[0]?.count).toBe("0");

    await migrate({ connectionString: databaseUrl! });
    const tableRows = await pool.query<{ tablename: string }>(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_synesis_migrations'
      ORDER BY tablename
    `);
    expect(tableRows.rows.map((row) => row.tablename)).toHaveLength(20);

    const indexes = await pool.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname IN (
        'keeperhub_executions_idempotency_unique',
        'keeperhub_executions_successful_purpose_unique',
        'olas_requests_chain_request_unique',
        'event_inbox_source_event_unique',
        'audit_events_terminal_transition_unique'
      )
    `);
    expect(indexes.rows).toHaveLength(5);
    await pool.end();

    await seedDevelopmentFixtures({
      connectionString: databaseUrl!,
      mode: "demo",
    });
    store = createSynesisStore({
      connectionString: databaseUrl!,
      maxConnections: 2,
    });
    await store.transaction(async (repositories) => {
      await repositories.mechs.create({
        id: "test_mech",
        chainId: 8453,
        address: "0x0000000000000000000000000000000000000001",
        serviceId: "test-service",
        paymentType: "native",
        status: "active",
        observedAt: "2026-09-14T10:00:00.000Z",
      });
      await repositories.intents.create({
        id: "test_intent",
        organizationId: "dev_org_synesis",
        state: "DRAFT",
        strategy: "AAVE_V3_USDC_SUPPLY",
        amount: "1000000",
        chainId: 8453,
        snapshotHash: `sha256:${"0".repeat(64)}`,
        policyVersionId: "dev_policy_guardrails_v1",
        expiresAt: "2026-09-15T10:00:00.000Z",
      });
      await repositories.intentMechs.create({
        id: "test_intent_mech",
        intentId: "test_intent",
        mechId: "test_mech",
        toolId: "risk-analysis",
        quotedPrice: "10",
        requestCid: "bafy-test-request",
      });
    });
  });

  it("deduplicates inbox events and rolls back failed units of work", async () => {
    const first = await store.transaction((repositories) =>
      repositories.events.accept({
        id: "event_1",
        source: "olas",
        eventKey: "8453:request-1:delivery",
        payloadHash: "sha256:event-1",
      }),
    );
    const duplicate = await store.transaction((repositories) =>
      repositories.events.accept({
        id: "event_2",
        source: "olas",
        eventKey: "8453:request-1:delivery",
        payloadHash: "sha256:event-1",
      }),
    );
    expect(first).toBe(true);
    expect(duplicate).toBe(false);

    await expect(
      store.transaction(async (repositories) => {
        await repositories.events.accept({
          id: "event_rollback",
          source: "keeperhub",
          eventKey: "will-roll-back",
          payloadHash: "sha256:rollback",
        });
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");
    await expect(
      store.read.events.exists("keeperhub", "will-roll-back"),
    ).resolves.toBe(false);
  });

  it("enforces Olas and KeeperHub economic uniqueness", async () => {
    await store.transaction(async (repositories) => {
      await repositories.olasRequests.create({
        id: "olas_request_1",
        intentMechId: "test_intent_mech",
        chainId: 8453,
        requestId: "request-42",
        state: "submitted",
      });
      await repositories.keeperHubExecutions.create({
        id: "keeper_execution_1",
        intentId: "test_intent",
        purpose: "AAVE_SUPPLY",
        idempotencyKey: "test-intent:aave-supply:1",
        simulationHash: "sha256:simulation-1",
      });
      await repositories.keeperHubExecutions.create({
        id: "keeper_execution_2",
        intentId: "test_intent",
        purpose: "AAVE_SUPPLY",
        idempotencyKey: "test-intent:aave-supply:2",
        simulationHash: "sha256:simulation-2",
      });
    });

    await expect(
      store.transaction((repositories) =>
        repositories.olasRequests.create({
          id: "olas_request_duplicate",
          intentMechId: "test_intent_mech",
          chainId: 8453,
          requestId: "request-42",
          state: "submitted",
        }),
      ),
    ).rejects.toThrow();

    await expect(
      store.transaction((repositories) =>
        repositories.keeperHubExecutions.create({
          id: "keeper_execution_duplicate",
          intentId: "test_intent",
          purpose: "OLAS_REQUEST",
          idempotencyKey: "test-intent:aave-supply:1",
          simulationHash: "sha256:simulation-3",
        }),
      ),
    ).rejects.toThrow();

    await store.transaction((repositories) =>
      repositories.keeperHubExecutions.markEconomicSuccess({
        id: "keeper_execution_1",
        executionId: "keeperhub-live-execution-1",
      }),
    );
    await expect(
      store.transaction((repositories) =>
        repositories.keeperHubExecutions.markEconomicSuccess({
          id: "keeper_execution_2",
          executionId: "keeperhub-live-execution-2",
        }),
      ),
    ).rejects.toThrow();
  });

  it("stores optimistic state transitions and their audit evidence atomically", async () => {
    const transition: IntentStateTransition = {
      schemaVersion: "1.0",
      intentId: "test_intent",
      from: "DRAFT",
      to: "QUOTING",
      fromVersion: 0,
      toVersion: 1,
      actor: { type: "WORKER", id: "orchestrator" },
      reason: "Begin live Mech quotation",
      traceId: "trace-test-intent",
      occurredAt: "2026-09-14T10:01:00.000Z",
      beforeHash: `sha256:${"1".repeat(64)}`,
      afterHash: `sha256:${"2".repeat(64)}`,
    };

    const updated = await store.transaction((repositories) =>
      repositories.intents.applyTransition(transition),
    );
    expect(updated).toMatchObject({ state: "QUOTING", stateVersion: 1 });
    await expect(
      store.read.auditEvents.listForIntent("test_intent"),
    ).resolves.toMatchObject([
      {
        action: "intent.state.transitioned",
        transitionFrom: "DRAFT",
        transitionTo: "QUOTING",
        intentStateVersion: 1,
      },
    ]);

    await expect(
      store.transaction((repositories) =>
        repositories.intents.applyTransition(transition),
      ),
    ).rejects.toThrow("was changed before transition");
  });
});
