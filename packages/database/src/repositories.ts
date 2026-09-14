import { randomUUID } from "node:crypto";

import type { IntentStateTransition } from "@synesis/domain";
import { isTerminalIntentState } from "@synesis/domain";
import { and, asc, eq } from "drizzle-orm";
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
    applyTransition(transition: IntentStateTransition): Promise<IntentRecord>;
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
    markEconomicSuccess(input: {
      readonly id: string;
      readonly executionId: string;
    }): Promise<KeeperHubExecutionRecord>;
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
  },
});

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
      applyTransition: async (transition) => {
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
