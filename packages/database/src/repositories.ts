import { randomUUID } from "node:crypto";

import type { IntentStateTransition } from "@synesis/domain";
import { isTerminalIntentState, TERMINAL_INTENT_STATES } from "@synesis/domain";
import { and, asc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema.js";

const { Pool } = pg;

type SynesisDatabase = NodePgDatabase<typeof schema>;
type TransactionCallback = Parameters<SynesisDatabase["transaction"]>[0];
type SynesisTransaction = Parameters<TransactionCallback>[0];
type DatabaseExecutor = SynesisDatabase | SynesisTransaction;

export type IntentRecord = typeof schema.intents.$inferSelect;
export type EventInboxRecord = typeof schema.eventInbox.$inferSelect;
export type AuditEventRecord = typeof schema.auditEvents.$inferSelect;
export type KeeperHubExecutionRecord =
  typeof schema.keeperHubExecutions.$inferSelect;
export type OutboxMessageRecord = typeof schema.outboxMessages.$inferSelect;

export interface OutboxMessageInput {
  readonly id: string;
  readonly topic: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly messageKey: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly traceId: string;
  readonly availableAt?: string;
}

export type EncryptedSecretReference =
  `vault://${string}` | `kms://${string}` | `secret-manager://${string}`;

const encryptedSecretReferencePattern = /^(vault|kms|secret-manager):\/\/.+/u;

export const asEncryptedSecretReference = (
  value: string,
): EncryptedSecretReference => {
  if (!encryptedSecretReferencePattern.test(value)) {
    throw new TypeError(
      "Integration credentials must be an encrypted vault://, kms://, or secret-manager:// reference",
    );
  }
  return value as EncryptedSecretReference;
};

export class PersistenceConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PersistenceConflictError";
  }
}

export interface ReadRepositories {
  readonly intents: {
    findById(id: string): Promise<IntentRecord | undefined>;
    listActive(): Promise<readonly IntentRecord[]>;
  };
  readonly events: {
    exists(source: string, eventKey: string): Promise<boolean>;
  };
  readonly auditEvents: {
    listForIntent(intentId: string): Promise<readonly AuditEventRecord[]>;
  };
  readonly keeperHubExecutions: {
    findByIdempotencyKey(
      idempotencyKey: string,
    ): Promise<KeeperHubExecutionRecord | undefined>;
    countForIntentPurpose(intentId: string, purpose: string): Promise<number>;
  };
  readonly outbox: {
    findByMessageKey(
      messageKey: string,
    ): Promise<OutboxMessageRecord | undefined>;
  };
}

export interface TransactionRepositories extends ReadRepositories {
  readonly organizations: {
    create(input: typeof schema.organizations.$inferInsert): Promise<void>;
  };
  readonly policyVersions: {
    create(input: typeof schema.policyVersions.$inferInsert): Promise<void>;
  };
  readonly mechs: {
    create(input: typeof schema.mechs.$inferInsert): Promise<void>;
  };
  readonly intents: ReadRepositories["intents"] & {
    create(input: typeof schema.intents.$inferInsert): Promise<void>;
    lock(id: string): Promise<IntentRecord | undefined>;
    applyTransition(transition: IntentStateTransition): Promise<IntentRecord>;
    applyTransitionWithOutbox(input: {
      readonly transition: IntentStateTransition;
      readonly outbox: Omit<
        OutboxMessageInput,
        "aggregateType" | "aggregateId" | "traceId"
      >;
    }): Promise<{
      readonly intent: IntentRecord;
      readonly outbox: OutboxMessageRecord;
    }>;
  };
  readonly intentMechs: {
    create(input: typeof schema.intentMechs.$inferInsert): Promise<void>;
  };
  readonly integrationConnections: {
    upsert(input: {
      readonly id: string;
      readonly organizationId: string;
      readonly integrationType: string;
      readonly encryptedSecretRef: EncryptedSecretReference;
      readonly health?: string;
      readonly checkedAt?: string | null;
    }): Promise<void>;
  };
  readonly events: ReadRepositories["events"] & {
    accept(input: {
      readonly id: string;
      readonly source: string;
      readonly eventKey: string;
      readonly payloadHash: string;
    }): Promise<boolean>;
  };
  readonly olasRequests: {
    create(input: typeof schema.olasRequests.$inferInsert): Promise<void>;
  };
  readonly keeperHubExecutions: ReadRepositories["keeperHubExecutions"] & {
    create(
      input: typeof schema.keeperHubExecutions.$inferInsert,
    ): Promise<void>;
    reserve(input: typeof schema.keeperHubExecutions.$inferInsert): Promise<{
      readonly execution: KeeperHubExecutionRecord;
      readonly created: boolean;
    }>;
    markEconomicSuccess(input: {
      readonly id: string;
      readonly executionId: string;
    }): Promise<KeeperHubExecutionRecord>;
  };
  readonly outbox: ReadRepositories["outbox"] & {
    enqueue(input: OutboxMessageInput): Promise<{
      readonly message: OutboxMessageRecord;
      readonly created: boolean;
    }>;
    claimBatch(input: {
      readonly workerId: string;
      readonly limit: number;
      readonly now: string;
      readonly leaseExpiresBefore: string;
    }): Promise<readonly OutboxMessageRecord[]>;
    markPublished(id: string, publishedAt: string): Promise<void>;
    markRetry(input: {
      readonly id: string;
      readonly error: string;
      readonly availableAt: string;
      readonly maxAttempts: number;
    }): Promise<void>;
    requeueExpiredLeases(leaseExpiresBefore: string): Promise<number>;
  };
}

export interface SynesisStore {
  readonly read: ReadRepositories;
  transaction<T>(
    work: (repositories: TransactionRepositories) => Promise<T>,
  ): Promise<T>;
  close(): Promise<void>;
}

const createReadRepositories = (
  database: DatabaseExecutor,
): ReadRepositories => ({
  intents: {
    findById: async (id) => {
      const rows = await database
        .select()
        .from(schema.intents)
        .where(eq(schema.intents.id, id))
        .limit(1);
      return rows[0];
    },
    listActive: () =>
      database
        .select()
        .from(schema.intents)
        .where(notInArray(schema.intents.state, [...TERMINAL_INTENT_STATES])),
  },
  events: {
    exists: async (source, eventKey) => {
      const rows = await database
        .select({ id: schema.eventInbox.id })
        .from(schema.eventInbox)
        .where(
          and(
            eq(schema.eventInbox.source, source),
            eq(schema.eventInbox.eventKey, eventKey),
          ),
        )
        .limit(1);
      return rows.length === 1;
    },
  },
  auditEvents: {
    listForIntent: (intentId) =>
      database
        .select()
        .from(schema.auditEvents)
        .where(eq(schema.auditEvents.intentId, intentId))
        .orderBy(asc(schema.auditEvents.occurredAt)),
  },
  keeperHubExecutions: {
    findByIdempotencyKey: async (idempotencyKey) => {
      const rows = await database
        .select()
        .from(schema.keeperHubExecutions)
        .where(eq(schema.keeperHubExecutions.idempotencyKey, idempotencyKey))
        .limit(1);
      return rows[0];
    },
    countForIntentPurpose: async (intentId, purpose) => {
      const rows = await database
        .select({ count: sql<number>`count(*)::integer` })
        .from(schema.keeperHubExecutions)
        .where(
          and(
            eq(schema.keeperHubExecutions.intentId, intentId),
            eq(schema.keeperHubExecutions.purpose, purpose),
          ),
        );
      return rows[0]?.count ?? 0;
    },
  },
  outbox: {
    findByMessageKey: async (messageKey) => {
      const rows = await database
        .select()
        .from(schema.outboxMessages)
        .where(eq(schema.outboxMessages.messageKey, messageKey))
        .limit(1);
      return rows[0];
    },
  },
});

const enqueueOutboxMessage = async (
  database: DatabaseExecutor,
  input: OutboxMessageInput,
): Promise<{
  readonly message: OutboxMessageRecord;
  readonly created: boolean;
}> => {
  const inserted = await database
    .insert(schema.outboxMessages)
    .values(input)
    .onConflictDoNothing({ target: schema.outboxMessages.messageKey })
    .returning();
  if (inserted[0]) return { message: inserted[0], created: true };

  const existing = await database
    .select()
    .from(schema.outboxMessages)
    .where(eq(schema.outboxMessages.messageKey, input.messageKey))
    .limit(1);
  if (!existing[0]) {
    throw new PersistenceConflictError(
      `Outbox message ${input.messageKey} could not be persisted`,
    );
  }
  return { message: existing[0], created: false };
};

const applyIntentTransition = async (
  database: DatabaseExecutor,
  transition: IntentStateTransition,
): Promise<IntentRecord> => {
  const updated = await database
    .update(schema.intents)
    .set({
      state: transition.to,
      stateVersion: transition.toVersion,
      updatedAt: transition.occurredAt,
    })
    .where(
      and(
        eq(schema.intents.id, transition.intentId),
        eq(schema.intents.state, transition.from),
        eq(schema.intents.stateVersion, transition.fromVersion),
      ),
    )
    .returning();
  const intent = updated[0];
  if (!intent) {
    throw new PersistenceConflictError(
      `Intent ${transition.intentId} was changed before transition ${transition.fromVersion} could be stored`,
    );
  }

  await database.insert(schema.auditEvents).values({
    id: randomUUID(),
    organizationId: intent.organizationId,
    intentId: intent.id,
    actor: transition.actor,
    action: "intent.state.transitioned",
    entityType: "intent",
    entityId: intent.id,
    beforeHash: transition.beforeHash,
    afterHash: transition.afterHash,
    traceId: transition.traceId,
    reason: transition.reason,
    transitionFrom: transition.from,
    transitionTo: transition.to,
    intentStateVersion: transition.toVersion,
    isTerminalTransition: isTerminalIntentState(transition.to),
    occurredAt: transition.occurredAt,
  });
  return intent;
};

const createTransactionRepositories = (
  database: SynesisTransaction,
): TransactionRepositories => {
  const read = createReadRepositories(database);

  return {
    ...read,
    organizations: {
      create: async (input) => {
        await database.insert(schema.organizations).values(input);
      },
    },
    policyVersions: {
      create: async (input) => {
        await database.insert(schema.policyVersions).values(input);
      },
    },
    mechs: {
      create: async (input) => {
        await database.insert(schema.mechs).values(input);
      },
    },
    intents: {
      ...read.intents,
      create: async (input) => {
        await database.insert(schema.intents).values(input);
      },
      lock: async (id) => {
        await database.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`,
        );
        const rows = await database
          .select()
          .from(schema.intents)
          .where(eq(schema.intents.id, id))
          .limit(1)
          .for("update");
        return rows[0];
      },
      applyTransition: (transition) =>
        applyIntentTransition(database, transition),
      applyTransitionWithOutbox: async ({ transition, outbox }) => {
        await database.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${transition.intentId}, 0))`,
        );
        const intent = await applyIntentTransition(database, transition);
        const result = await enqueueOutboxMessage(database, {
          ...outbox,
          aggregateType: "intent",
          aggregateId: transition.intentId,
          traceId: transition.traceId,
        });
        return { intent, outbox: result.message };
      },
    },
    intentMechs: {
      create: async (input) => {
        await database.insert(schema.intentMechs).values(input);
      },
    },
    integrationConnections: {
      upsert: async (input) => {
        asEncryptedSecretReference(input.encryptedSecretRef);
        await database
          .insert(schema.integrationConnections)
          .values(input)
          .onConflictDoUpdate({
            target: [
              schema.integrationConnections.organizationId,
              schema.integrationConnections.integrationType,
            ],
            set: {
              encryptedSecretRef: input.encryptedSecretRef,
              health: input.health ?? "unknown",
              checkedAt: input.checkedAt,
            },
          });
      },
    },
    events: {
      ...read.events,
      accept: async (input) => {
        const inserted = await database
          .insert(schema.eventInbox)
          .values(input)
          .onConflictDoNothing({
            target: [schema.eventInbox.source, schema.eventInbox.eventKey],
          })
          .returning({ id: schema.eventInbox.id });
        return inserted.length === 1;
      },
    },
    olasRequests: {
      create: async (input) => {
        await database.insert(schema.olasRequests).values(input);
      },
    },
    keeperHubExecutions: {
      ...read.keeperHubExecutions,
      create: async (input) => {
        await database.insert(schema.keeperHubExecutions).values(input);
      },
      reserve: async (input) => {
        const inserted = await database
          .insert(schema.keeperHubExecutions)
          .values(input)
          .onConflictDoNothing()
          .returning();
        if (inserted[0]) return { execution: inserted[0], created: true };

        const execution = await read.keeperHubExecutions.findByIdempotencyKey(
          input.idempotencyKey,
        );
        if (!execution) {
          throw new PersistenceConflictError(
            `KeeperHub reservation ${input.idempotencyKey} could not be persisted`,
          );
        }
        return { execution, created: false };
      },
      markEconomicSuccess: async ({ id, executionId }) => {
        const updated = await database
          .update(schema.keeperHubExecutions)
          .set({
            executionId,
            status: "completed",
            economicSuccess: true,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.keeperHubExecutions.id, id))
          .returning();
        const execution = updated[0];
        if (!execution)
          throw new PersistenceConflictError(
            `KeeperHub execution ${id} does not exist`,
          );
        return execution;
      },
    },
    outbox: {
      ...read.outbox,
      enqueue: (input) => enqueueOutboxMessage(database, input),
      claimBatch: async ({ workerId, limit, now, leaseExpiresBefore }) => {
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          throw new RangeError("Outbox claim limit must be between 1 and 100");
        }
        const candidates = await database.execute<{ id: string }>(sql`
          select ${schema.outboxMessages.id} as id
          from ${schema.outboxMessages}
          where (
            (${schema.outboxMessages.status} = 'pending' and ${schema.outboxMessages.availableAt} <= ${now})
            or (
              ${schema.outboxMessages.status} = 'dispatching'
              and ${schema.outboxMessages.lockedAt} < ${leaseExpiresBefore}
            )
          )
          order by ${schema.outboxMessages.availableAt}, ${schema.outboxMessages.createdAt}
          for update skip locked
          limit ${limit}
        `);
        const ids = candidates.rows.map((row) => row.id);
        if (ids.length === 0) return [];
        return database
          .update(schema.outboxMessages)
          .set({
            status: "dispatching",
            attempts: sql`${schema.outboxMessages.attempts} + 1`,
            lockedAt: now,
            lockedBy: workerId,
          })
          .where(inArray(schema.outboxMessages.id, ids))
          .returning();
      },
      markPublished: async (id, publishedAt) => {
        const rows = await database
          .update(schema.outboxMessages)
          .set({
            status: "published",
            publishedAt,
            lockedAt: null,
            lockedBy: null,
            lastError: null,
          })
          .where(
            and(
              eq(schema.outboxMessages.id, id),
              eq(schema.outboxMessages.status, "dispatching"),
            ),
          )
          .returning({ id: schema.outboxMessages.id });
        if (!rows[0]) {
          throw new PersistenceConflictError(
            `Outbox message ${id} is not leased for dispatch`,
          );
        }
      },
      markRetry: async ({ id, error, availableAt, maxAttempts }) => {
        await database
          .update(schema.outboxMessages)
          .set({
            status: sql`case when ${schema.outboxMessages.attempts} >= ${maxAttempts} then 'dead' else 'pending' end`,
            availableAt,
            lockedAt: null,
            lockedBy: null,
            lastError: error.slice(0, 2_000),
          })
          .where(
            and(
              eq(schema.outboxMessages.id, id),
              eq(schema.outboxMessages.status, "dispatching"),
            ),
          );
      },
      requeueExpiredLeases: async (leaseExpiresBefore) => {
        const rows = await database
          .update(schema.outboxMessages)
          .set({
            status: "pending",
            lockedAt: null,
            lockedBy: null,
            lastError: "Dispatch lease expired; reclaimed by reconciliation",
          })
          .where(
            and(
              eq(schema.outboxMessages.status, "dispatching"),
              lt(schema.outboxMessages.lockedAt, leaseExpiresBefore),
            ),
          )
          .returning({ id: schema.outboxMessages.id });
        return rows.length;
      },
    },
  };
};

export const createSynesisStore = (options: {
  readonly connectionString: string;
  readonly maxConnections?: number;
}): SynesisStore => {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
  });
  const database = drizzle(pool, { schema });

  return {
    read: createReadRepositories(database),
    transaction: (work) =>
      database.transaction((transaction) =>
        work(createTransactionRepositories(transaction)),
      ),
    close: () => pool.end(),
  };
};
