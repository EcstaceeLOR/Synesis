import { randomUUID } from "node:crypto";

import type { IntentStateTransition } from "@synesis/domain";
import type {
  IntentRecord,
  OutboxMessageRecord,
  SynesisStore,
  TransactionRepositories,
} from "@synesis/database";
import {
  computeBoundedBackoff,
  getStateDeadline,
  parseCoordinatorJobData,
  type CoordinatorJobData,
  type CoordinatorProcessor,
  type DurableCoordinatorQueue,
} from "@synesis/queue";

export interface Clock {
  now(): Date;
}

const systemClock: Clock = { now: () => new Date() };

export class DurableIntentCoordinator {
  public constructor(private readonly store: SynesisStore) {}

  public advanceIntent(input: {
    readonly transition: IntentStateTransition;
    readonly outboxId: string;
    readonly nextJob: CoordinatorJobData["name"];
    readonly availableAt?: string;
  }): Promise<IntentRecord> {
    return this.store.transaction(async (repositories) => {
      const result = await repositories.intents.applyTransitionWithOutbox({
        transition: input.transition,
        outbox: {
          id: input.outboxId,
          topic: input.nextJob,
          messageKey: `intent-${input.transition.intentId}-${input.nextJob}-v${input.transition.toVersion}`,
          payload: {
            state: input.transition.to,
            stateVersion: input.transition.toVersion,
            stateEnteredAt: input.transition.occurredAt,
          },
          ...(input.availableAt ? { availableAt: input.availableAt } : {}),
        },
      });
      return result.intent;
    });
  }

  public ingestEvent(input: {
    readonly event: {
      readonly id: string;
      readonly source: string;
      readonly eventKey: string;
      readonly payloadHash: string;
    };
    readonly job?: {
      readonly id: string;
      readonly intentId: string;
      readonly traceId: string;
      readonly name: CoordinatorJobData["name"];
      readonly state: CoordinatorJobData["state"];
      readonly stateVersion: number;
      readonly stateEnteredAt: string;
    };
  }): Promise<boolean> {
    return this.store.transaction(async (repositories) => {
      const accepted = await repositories.events.accept(input.event);
      if (!accepted || !input.job) return accepted;
      await repositories.outbox.enqueue({
        id: input.job.id,
        topic: input.job.name,
        aggregateType: "intent",
        aggregateId: input.job.intentId,
        messageKey: `event-${input.event.source}-${input.event.eventKey}`,
        payload: {
          state: input.job.state,
          stateVersion: input.job.stateVersion,
          stateEnteredAt: input.job.stateEnteredAt,
        },
        traceId: input.job.traceId,
      });
      return true;
    });
  }
}

export interface OutboxPublisherResult {
  readonly claimed: number;
  readonly published: number;
  readonly failed: number;
}

const requireString = (
  payload: Record<string, unknown>,
  key: string,
): string => {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`Outbox payload ${key} must be a non-empty string`);
  }
  return value;
};

export const outboxRecordToJob = (
  message: OutboxMessageRecord,
): CoordinatorJobData => {
  if (
    message.topic !== "intent.advance" &&
    message.topic !== "intent.reconcile"
  ) {
    throw new TypeError(`Unsupported outbox topic: ${message.topic}`);
  }
  if (
    typeof message.payload !== "object" ||
    message.payload === null ||
    Array.isArray(message.payload)
  ) {
    throw new TypeError("Outbox payload must be an object");
  }
  const payload = message.payload as Record<string, unknown>;
  const stateVersion = payload.stateVersion;
  if (!Number.isInteger(stateVersion) || (stateVersion as number) < 0) {
    throw new TypeError("Outbox payload stateVersion must be non-negative");
  }

  return parseCoordinatorJobData({
    schemaVersion: "1.0",
    outboxId: message.id,
    intentId: message.aggregateId,
    traceId: message.traceId,
    name: message.topic,
    state: requireString(payload, "state"),
    stateVersion: stateVersion as number,
    stateEnteredAt: requireString(payload, "stateEnteredAt"),
  });
};

export class OutboxPublisher {
  public constructor(
    private readonly store: SynesisStore,
    private readonly queue: DurableCoordinatorQueue,
    private readonly options: {
      readonly workerId: string;
      readonly batchSize?: number;
      readonly leaseMs?: number;
      readonly maxAttempts?: number;
      readonly clock?: Clock;
      readonly random?: () => number;
    },
  ) {}

  public async drainOnce(): Promise<OutboxPublisherResult> {
    const clock = this.options.clock ?? systemClock;
    const now = clock.now();
    const leaseMs = this.options.leaseMs ?? 30_000;
    const claimed = await this.store.transaction((repositories) =>
      repositories.outbox.claimBatch({
        workerId: this.options.workerId,
        limit: this.options.batchSize ?? 25,
        now: now.toISOString(),
        leaseExpiresBefore: new Date(now.getTime() - leaseMs).toISOString(),
      }),
    );

    let published = 0;
    let failed = 0;
    for (const message of claimed) {
      try {
        await this.queue.publish(outboxRecordToJob(message));
        await this.store.transaction((repositories) =>
          repositories.outbox.markPublished(
            message.id,
            clock.now().toISOString(),
          ),
        );
        published += 1;
      } catch (error) {
        const delay = computeBoundedBackoff(
          message.attempts,
          this.options.random,
        );
        await this.store.transaction((repositories) =>
          repositories.outbox.markRetry({
            id: message.id,
            error: error instanceof Error ? error.message : "Unknown error",
            availableAt: new Date(clock.now().getTime() + delay).toISOString(),
            maxAttempts: this.options.maxAttempts ?? 6,
          }),
        );
        failed += 1;
      }
    }

    return { claimed: claimed.length, published, failed };
  }
}

export interface ReconciliationResult {
  readonly reclaimedLeases: number;
  readonly overdueIntents: number;
  readonly jobsCreated: number;
}

export class ReconciliationService {
  public constructor(
    private readonly store: SynesisStore,
    private readonly options: {
      readonly leaseMs?: number;
      readonly clock?: Clock;
    } = {},
  ) {}

  public async runOnce(): Promise<ReconciliationResult> {
    const clock = this.options.clock ?? systemClock;
    const now = clock.now();
    const reclaimedLeases = await this.store.transaction((repositories) =>
      repositories.outbox.requeueExpiredLeases(
        new Date(
          now.getTime() - (this.options.leaseMs ?? 30_000),
        ).toISOString(),
      ),
    );
    const intents = await this.store.read.intents.listActive();
    const overdue = intents.filter(
      (intent) =>
        getStateDeadline(intent.state, intent.updatedAt) <= now.getTime(),
    );

    let jobsCreated = 0;
    for (const candidate of overdue) {
      const created = await this.store.transaction(async (repositories) => {
        const intent = await repositories.intents.lock(candidate.id);
        if (!intent || intent.stateVersion !== candidate.stateVersion)
          return false;
        const result = await repositories.outbox.enqueue({
          id: randomUUID(),
          topic: "intent.reconcile",
          aggregateType: "intent",
          aggregateId: intent.id,
          messageKey: `intent-${intent.id}-reconcile-v${intent.stateVersion}`,
          payload: {
            state: intent.state,
            stateVersion: intent.stateVersion,
            stateEnteredAt: intent.updatedAt,
          },
          traceId: `reconcile-${intent.id}-${intent.stateVersion}`,
        });
        return result.created;
      });
      if (created) jobsCreated += 1;
    }

    return {
      reclaimedLeases,
      overdueIntents: overdue.length,
      jobsCreated,
    };
  }
}

export type LockedIntentHandler = (context: {
  readonly data: CoordinatorJobData;
  readonly intent: IntentRecord;
  readonly repositories: TransactionRepositories;
  readonly signal: AbortSignal;
}) => Promise<void>;

export const createLockedCoordinatorProcessor =
  (options: {
    readonly store: SynesisStore;
    readonly handlers: Readonly<
      Record<CoordinatorJobData["name"], LockedIntentHandler>
    >;
  }): CoordinatorProcessor =>
  async (data, context) => {
    await options.store.transaction(async (repositories) => {
      const intent = await repositories.intents.lock(data.intentId);
      if (!intent) return;
      if (
        intent.state !== data.state ||
        intent.stateVersion !== data.stateVersion
      ) {
        return;
      }
      await options.handlers[data.name]({
        data,
        intent,
        repositories,
        signal: context.signal,
      });
    });
  };
