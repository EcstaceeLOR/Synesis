import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { IntentState } from "@synesis/domain";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow();
const amount = (name: string) => numeric(name, { precision: 78, scale: 0 });

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  authProvider: text("auth_provider").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
});

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    environment: text("environment").$type<"demo" | "live">().notNull(),
    pausedAt: timestamp("paused_at", { withTimezone: true, mode: "string" }),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      "organizations_environment_check",
      sql`${table.environment} in ('demo', 'live')`,
    ),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })],
);

export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    integrationType: text("integration_type").notNull(),
    encryptedSecretRef: text("encrypted_secret_ref").notNull(),
    health: text("health").notNull().default("unknown"),
    checkedAt: timestamp("checked_at", { withTimezone: true, mode: "string" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("integration_connections_org_type_unique").on(
      table.organizationId,
      table.integrationType,
    ),
    check(
      "integration_connections_secret_ref_check",
      sql`${table.encryptedSecretRef} ~ '^(vault|kms|secret-manager)://'`,
    ),
  ],
);

export const walletSnapshots = pgTable(
  "wallet_snapshots",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    walletAddress: text("wallet_address").notNull(),
    chainId: integer("chain_id").notNull(),
    ethBalance: amount("eth_balance").notNull(),
    usdcBalance: amount("usdc_balance").notNull(),
    blockNumber: bigint("block_number", { mode: "number" }).notNull(),
    capturedAt: timestamp("captured_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => [
    index("wallet_snapshots_org_captured_idx").on(
      table.organizationId,
      table.capturedAt,
    ),
  ],
);

export const mechs = pgTable(
  "mechs",
  {
    id: text("id").primaryKey(),
    chainId: integer("chain_id").notNull(),
    address: text("address").notNull(),
    serviceId: text("service_id").notNull(),
    paymentType: text("payment_type").notNull(),
    metadataCid: text("metadata_cid"),
    status: text("status").notNull(),
    observedAt: timestamp("observed_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => [
    uniqueIndex("mechs_chain_address_unique").on(table.chainId, table.address),
  ],
);

export const mechToolVersions = pgTable(
  "mech_tool_versions",
  {
    id: text("id").primaryKey(),
    mechId: text("mech_id")
      .notNull()
      .references(() => mechs.id, { onDelete: "cascade" }),
    toolId: text("tool_id").notNull(),
    inputSchema: jsonb("input_schema").notNull(),
    outputSchema: jsonb("output_schema").notNull(),
    schemaHash: text("schema_hash").notNull(),
    observedAt: timestamp("observed_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => [
    uniqueIndex("mech_tool_versions_unique").on(
      table.mechId,
      table.toolId,
      table.schemaHash,
    ),
  ],
);

export const policyVersions = pgTable(
  "policy_versions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    canonicalPolicy: jsonb("canonical_policy").notNull(),
    policyHash: text("policy_hash").notNull(),
    activatedAt: timestamp("activated_at", {
      withTimezone: true,
      mode: "string",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("policy_versions_org_name_version_unique").on(
      table.organizationId,
      table.name,
      table.version,
    ),
    check("policy_versions_version_check", sql`${table.version} > 0`),
  ],
);

export const intents = pgTable(
  "intents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    state: text("state").$type<IntentState>().notNull(),
    stateVersion: integer("state_version").notNull().default(0),
    strategy: text("strategy").notNull(),
    amount: amount("amount").notNull(),
    chainId: integer("chain_id").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    policyVersionId: text("policy_version_id")
      .notNull()
      .references(() => policyVersions.id),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("intents_org_created_idx").on(table.organizationId, table.createdAt),
    check("intents_state_version_check", sql`${table.stateVersion} >= 0`),
    check("intents_amount_check", sql`${table.amount} > 0`),
  ],
);

export const intentMechs = pgTable(
  "intent_mechs",
  {
    id: text("id").primaryKey(),
    intentId: text("intent_id")
      .notNull()
      .references(() => intents.id, { onDelete: "cascade" }),
    mechId: text("mech_id")
      .notNull()
      .references(() => mechs.id),
    toolId: text("tool_id").notNull(),
    quotedPrice: amount("quoted_price").notNull(),
    requestCid: text("request_cid").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("intent_mechs_intent_mech_unique").on(
      table.intentId,
      table.mechId,
    ),
  ],
);

export const keeperHubExecutions = pgTable(
  "keeperhub_executions",
  {
    id: text("id").primaryKey(),
    intentId: text("intent_id")
      .notNull()
      .references(() => intents.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    executionId: text("execution_id"),
    simulationHash: text("simulation_hash").notNull(),
    status: text("status").notNull().default("pending"),
    economicSuccess: boolean("economic_success").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("keeperhub_executions_idempotency_unique").on(
      table.idempotencyKey,
    ),
    uniqueIndex("keeperhub_executions_execution_id_unique").on(
      table.executionId,
    ),
    uniqueIndex("keeperhub_executions_successful_purpose_unique")
      .on(table.intentId, table.purpose)
      .where(sql`${table.economicSuccess} = true`),
    check(
      "keeperhub_executions_success_status_check",
      sql`not ${table.economicSuccess} or ${table.status} = 'completed'`,
    ),
  ],
);

export const olasRequests = pgTable(
  "olas_requests",
  {
    id: text("id").primaryKey(),
    intentMechId: text("intent_mech_id")
      .notNull()
      .references(() => intentMechs.id, { onDelete: "cascade" }),
    chainId: integer("chain_id").notNull(),
    requestId: text("request_id").notNull(),
    keeperHubExecutionId: text("keeperhub_execution_id").references(
      () => keeperHubExecutions.id,
    ),
    transactionHash: text("transaction_hash"),
    state: text("state").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("olas_requests_chain_request_unique").on(
      table.chainId,
      table.requestId,
    ),
  ],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    olasRequestId: text("olas_request_id")
      .notNull()
      .references(() => olasRequests.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    blockNumber: bigint("block_number", { mode: "number" }).notNull(),
    transactionHash: text("transaction_hash").notNull(),
    resultCid: text("result_cid").notNull(),
    resultHash: text("result_hash").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("deliveries_request_event_unique").on(
      table.olasRequestId,
      table.eventKey,
    ),
  ],
);

export const recommendations = pgTable("recommendations", {
  id: text("id").primaryKey(),
  deliveryId: text("delivery_id")
    .notNull()
    .references(() => deliveries.id, { onDelete: "cascade" })
    .unique(),
  normalizedPayload: jsonb("normalized_payload").notNull(),
  validationStatus: text("validation_status").notNull(),
  contentHash: text("content_hash").notNull(),
  createdAt: createdAt(),
});

export const policyEvaluations = pgTable(
  "policy_evaluations",
  {
    id: text("id").primaryKey(),
    intentId: text("intent_id")
      .notNull()
      .references(() => intents.id, { onDelete: "cascade" }),
    policyVersionId: text("policy_version_id")
      .notNull()
      .references(() => policyVersions.id),
    inputHash: text("input_hash").notNull(),
    result: text("result").notNull(),
    ruleResults: jsonb("rule_results").notNull(),
    outputHash: text("output_hash").notNull(),
    evaluatedAt: timestamp("evaluated_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => [
    uniqueIndex("policy_evaluations_intent_output_unique").on(
      table.intentId,
      table.outputHash,
    ),
  ],
);

export const executionPlans = pgTable("execution_plans", {
  id: text("id").primaryKey(),
  intentId: text("intent_id")
    .notNull()
    .references(() => intents.id, { onDelete: "cascade" })
    .unique(),
  target: text("target").notNull(),
  functionName: text("function_name").notNull(),
  arguments: jsonb("arguments").notNull(),
  abiHash: text("abi_hash").notNull(),
  value: amount("value").notNull(),
  planHash: text("plan_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  createdAt: createdAt(),
});

export const transactionReceipts = pgTable("transaction_receipts", {
  id: text("id").primaryKey(),
  keeperHubExecutionId: text("keeperhub_execution_id")
    .notNull()
    .references(() => keeperHubExecutions.id, { onDelete: "cascade" })
    .unique(),
  transactionHash: text("transaction_hash").unique(),
  blockNumber: bigint("block_number", { mode: "number" }),
  status: text("status").notNull(),
  verified: boolean("verified").notNull().default(false),
  rawReceiptHash: text("raw_receipt_hash").notNull(),
  observedAt: timestamp("observed_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
});

export const eventInbox = pgTable(
  "event_inbox",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    eventKey: text("event_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: text("status").notNull().default("received"),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "string",
    }),
  },
  (table) => [
    uniqueIndex("event_inbox_source_event_unique").on(
      table.source,
      table.eventKey,
    ),
  ],
);

export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: text("id").primaryKey(),
    topic: text("topic").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    messageKey: text("message_key").notNull().unique(),
    payload: jsonb("payload").notNull(),
    traceId: text("trace_id").notNull(),
    status: text("status")
      .$type<"pending" | "dispatching" | "published" | "dead">()
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", {
      withTimezone: true,
      mode: "string",
    }),
    lockedBy: text("locked_by"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "string",
    }),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (table) => [
    index("outbox_messages_dispatch_idx")
      .on(table.availableAt, table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    index("outbox_messages_lease_idx")
      .on(table.lockedAt)
      .where(sql`${table.status} = 'dispatching'`),
    index("outbox_messages_aggregate_idx").on(
      table.aggregateType,
      table.aggregateId,
      table.createdAt,
    ),
    check("outbox_messages_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "outbox_messages_dispatch_lease_check",
      sql`(${table.status} = 'dispatching' and ${table.lockedAt} is not null and ${table.lockedBy} is not null) or ${table.status} <> 'dispatching'`,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    intentId: text("intent_id").references(() => intents.id, {
      onDelete: "cascade",
    }),
    actor: jsonb("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    beforeHash: text("before_hash"),
    afterHash: text("after_hash"),
    traceId: text("trace_id").notNull(),
    reason: text("reason"),
    transitionFrom: text("transition_from").$type<IntentState>(),
    transitionTo: text("transition_to").$type<IntentState>(),
    intentStateVersion: integer("intent_state_version"),
    isTerminalTransition: boolean("is_terminal_transition")
      .notNull()
      .default(false),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => [
    index("audit_events_intent_occurred_idx").on(
      table.intentId,
      table.occurredAt,
    ),
    uniqueIndex("audit_events_terminal_transition_unique")
      .on(table.intentId, table.intentStateVersion)
      .where(sql`${table.isTerminalTransition} = true`),
  ],
);

export const proofBundles = pgTable(
  "proof_bundles",
  {
    id: text("id").primaryKey(),
    intentId: text("intent_id")
      .notNull()
      .references(() => intents.id, { onDelete: "cascade" }),
    publicId: text("public_id").notNull().unique(),
    canonicalBundle: jsonb("canonical_bundle").notNull(),
    rootHash: text("root_hash").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("proof_bundles_intent_root_unique").on(
      table.intentId,
      table.rootHash,
    ),
  ],
);

export const synesisTables = {
  users,
  organizations,
  memberships,
  integrationConnections,
  walletSnapshots,
  mechs,
  mechToolVersions,
  policyVersions,
  intents,
  intentMechs,
  olasRequests,
  deliveries,
  recommendations,
  policyEvaluations,
  executionPlans,
  keeperHubExecutions,
  transactionReceipts,
  eventInbox,
  outboxMessages,
  auditEvents,
  proofBundles,
} as const;
