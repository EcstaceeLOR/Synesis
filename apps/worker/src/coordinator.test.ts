import type { IntentStateTransition } from "@synesis/domain";
import {
  createSynesisStore,
  migrate,
  rollback,
  type SynesisStore,
} from "@synesis/database";
import {
  createCoordinatorQueue,
  createCoordinatorWorker,
  type DurableCoordinatorQueue,
  type DurableCoordinatorWorker,
} from "@synesis/queue";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createLockedCoordinatorProcessor,
  DurableIntentCoordinator,
  outboxRecordToJob,
  OutboxPublisher,
  ReconciliationService,
  type Clock,
} from "./coordinator.js";

const { Pool } = pg;
const databaseUrl = process.env.WORKER_DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
const hash = (character: string): string => `sha256:${character.repeat(64)}`;

const ensureTestDatabase = async (connectionString: string): Promise<void> => {
  const target = new URL(connectionString);
  const databaseName = decodeURIComponent(target.pathname.slice(1));
  if (!/^[a-z][a-z0-9_]*$/u.test(databaseName)) {
    throw new Error("Worker test database name is unsafe");
  }
  target.pathname = "/postgres";
  const admin = new Pool({ connectionString: target.toString(), max: 1 });
  const exists = await admin.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
    [databaseName],
  );
  if (!exists.rows[0]?.exists) {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  }
  await admin.end();
};

const waitFor = async (condition: () => Promise<boolean>): Promise<void> => {
  const deadline = Date.now() + 10_000;
  while (!(await condition())) {
    if (Date.now() >= deadline) throw new Error("Condition timed out");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

describe.skipIf(!databaseUrl || !redisUrl)("durable coordinator", () => {
  let store: SynesisStore;
  let queue: DurableCoordinatorQueue;
  let worker: DurableCoordinatorWorker | undefined;
  const queueName = `synesis-coordinator-test-${process.pid}`;
  const now = new Date();
  const transitionTime = new Date(now.getTime() + 1_000).toISOString();

  beforeAll(async () => {
    await ensureTestDatabase(databaseUrl!);
    await rollback({ connectionString: databaseUrl!, steps: "all" });
    await migrate({ connectionString: databaseUrl! });
    store = createSynesisStore({
      connectionString: databaseUrl!,
      maxConnections: 6,
    });
    queue = createCoordinatorQueue({ redisUrl: redisUrl!, queueName });
    await queue.obliterate();

    await store.transaction(async (repositories) => {
      await repositories.organizations.create({
        id: "worker_org",
        name: "Worker Test",
        environment: "demo",
      });
      await repositories.policyVersions.create({
        id: "worker_policy",
        organizationId: "worker_org",
        name: "Worker Policy",
        version: 1,
        canonicalPolicy: { maxValue: "1000000" },
        policyHash: hash("a"),
      });
      await repositories.intents.create({
        id: "coordinator_intent",
        organizationId: "worker_org",
        state: "DRAFT",
        strategy: "AAVE_V3_USDC_SUPPLY",
        amount: "1000000",
        chainId: 8453,
        snapshotHash: hash("b"),
        policyVersionId: "worker_policy",
        expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      await repositories.intents.create({
        id: "overdue_intent",
        organizationId: "worker_org",
        state: "DRAFT",
        strategy: "AAVE_V3_USDC_SUPPLY",
        amount: "1000000",
        chainId: 8453,
        snapshotHash: hash("c"),
        policyVersionId: "worker_policy",
        expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
        createdAt: new Date(now.getTime() - 3_600_000).toISOString(),
        updatedAt: new Date(now.getTime() - 3_600_000).toISOString(),
      });
    });
  });

  afterAll(async () => {
    if (worker) await worker.close();
    await queue.obliterate();
    await queue.close();
    await store.close();
    await rollback({ connectionString: databaseUrl!, steps: "all" });
  });

  it("commits state changes with outbox messages atomically and deduplicates inbox events", async () => {
    const coordinator = new DurableIntentCoordinator(store);
    const transition: IntentStateTransition = {
      schemaVersion: "1.0",
      intentId: "coordinator_intent",
      from: "DRAFT",
      to: "QUOTING",
      fromVersion: 0,
      toVersion: 1,
      actor: { type: "WORKER", id: "coordinator" },
      reason: "Begin durable quotation",
      traceId: "trace-coordinator-intent",
      occurredAt: transitionTime,
      beforeHash: hash("d"),
      afterHash: hash("e"),
    };
    const outbox = {
      id: "outbox_advance_1",
      topic: "intent.advance",
      messageKey: "intent-coordinator_intent-intent.advance-v1",
      payload: {
        state: "QUOTING",
        stateVersion: 1,
        stateEnteredAt: transitionTime,
      },
    } as const;

    await expect(
      store.transaction(async (repositories) => {
        await repositories.intents.applyTransitionWithOutbox({
          transition,
          outbox,
        });
        throw new Error("simulated transaction crash");
      }),
    ).rejects.toThrow("simulated transaction crash");
    await expect(
      store.read.intents.findById("coordinator_intent"),
    ).resolves.toMatchObject({
      state: "DRAFT",
      stateVersion: 0,
    });
    await expect(
      store.read.outbox.findByMessageKey(outbox.messageKey),
    ).resolves.toBeUndefined();

    await coordinator.advanceIntent({
      transition,
      outboxId: outbox.id,
      nextJob: "intent.advance",
    });
    await expect(
      store.read.outbox.findByMessageKey(outbox.messageKey),
    ).resolves.toMatchObject({
      status: "pending",
      aggregateId: "coordinator_intent",
    });

    const first = await coordinator.ingestEvent({
      event: {
        id: "coordinator_event_1",
        source: "olas-webhook",
        eventKey: "8453-request-1-delivery",
        payloadHash: hash("f"),
      },
    });
    const duplicate = await coordinator.ingestEvent({
      event: {
        id: "coordinator_event_2",
        source: "olas-webhook",
        eventKey: "8453-request-1-delivery",
        payloadHash: hash("f"),
      },
    });
    expect({ first, duplicate }).toEqual({ first: true, duplicate: false });
  });

  it("serializes concurrent workers with an intent advisory and row lock", async () => {
    let releaseFirst!: () => void;
    let firstLocked!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      firstLocked = resolve;
    });

    const first = store.transaction(async (repositories) => {
      await repositories.intents.lock("coordinator_intent");
      firstLocked();
      await release;
    });
    await locked;

    let secondAcquired = false;
    const second = store.transaction(async (repositories) => {
      await repositories.intents.lock("coordinator_intent");
      secondAcquired = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(secondAcquired).toBe(false);
    releaseFirst();
    await Promise.all([first, second]);
    expect(secondAcquired).toBe(true);
  });

  it("recovers a publish crash and replays without duplicating an economic action", async () => {
    const claimTime = new Date(now.getTime() + 2_000);
    const claimed = await store.transaction((repositories) =>
      repositories.outbox.claimBatch({
        workerId: "crashing-worker",
        limit: 1,
        now: claimTime.toISOString(),
        leaseExpiresBefore: new Date(
          claimTime.getTime() - 30_000,
        ).toISOString(),
      }),
    );
    expect(claimed).toHaveLength(1);
    const jobData = outboxRecordToJob(claimed[0]!);

    const beforeCrashJobId = await queue.publish(jobData);
    // The process dies here: Redis has the job, but PostgreSQL has no publish ACK.
    const recoveredClock: Clock = {
      now: () => new Date(claimTime.getTime() + 60_000),
    };
    const publisher = new OutboxPublisher(store, queue, {
      workerId: "recovered-worker",
      clock: recoveredClock,
      leaseMs: 30_000,
      random: () => 0,
    });
    await expect(publisher.drainOnce()).resolves.toEqual({
      claimed: 1,
      published: 1,
      failed: 0,
    });
    const afterCrashJobId = await queue.publish(jobData);
    expect(afterCrashJobId).toBe(beforeCrashJobId);
    await expect(queue.has(beforeCrashJobId)).resolves.toBe(true);

    const processor = createLockedCoordinatorProcessor({
      store,
      handlers: {
        "intent.advance": async ({ repositories, intent }) => {
          await repositories.keeperHubExecutions.reserve({
            id: `execution-${intent.id}`,
            intentId: intent.id,
            purpose: "OLAS_REQUEST",
            idempotencyKey: `${intent.id}-olas-request-v1`,
            simulationHash: hash("1"),
          });
        },
        "intent.reconcile": () => Promise.resolve(),
      },
    });
    worker = createCoordinatorWorker({
      redisUrl: redisUrl!,
      queueName,
      concurrency: 2,
      processor,
    });
    await waitFor(
      async () =>
        (await store.read.keeperHubExecutions.countForIntentPurpose(
          "coordinator_intent",
          "OLAS_REQUEST",
        )) === 1,
    );

    await processor(jobData, {
      attemptsMade: 2,
      signal: new AbortController().signal,
    });
    await expect(
      store.read.keeperHubExecutions.countForIntentPurpose(
        "coordinator_intent",
        "OLAS_REQUEST",
      ),
    ).resolves.toBe(1);
    await worker.close();
    worker = undefined;
  });

  it("creates one reconciliation job per overdue state version", async () => {
    const clock: Clock = { now: () => now };
    const reconciler = new ReconciliationService(store, { clock });
    await expect(reconciler.runOnce()).resolves.toMatchObject({
      overdueIntents: 1,
      jobsCreated: 1,
    });
    await expect(reconciler.runOnce()).resolves.toMatchObject({
      overdueIntents: 1,
      jobsCreated: 0,
    });
  });
});
