import { z } from "zod";

import {
  actorSchema,
  addressSchema,
  baseChainIdSchema,
  basisPointsSchema,
  cidSchema,
  contentHashSchema,
  entityIdSchema,
  isoTimestampSchema,
  nonNegativeBaseUnitsSchema,
  positiveBaseUnitsSchema,
  riskScoreSchema,
  traceIdSchema,
  transactionHashSchema,
} from "./primitives.js";

export const INTENT_STATES = [
  "DRAFT",
  "QUOTING",
  "AWAITING_APPROVAL",
  "PROCUREMENT_READY",
  "PROCUREMENT_EXECUTING",
  "AWAITING_DELIVERIES",
  "EVALUATING",
  "REJECTED",
  "EXECUTION_READY",
  "AWAITING_FINAL_APPROVAL",
  "EXECUTING",
  "SUCCEEDED",
  "FAILED",
  "UNCONFIRMED",
  "EXPIRED",
  "CANCELLED",
] as const;

export const intentStateSchema = z.enum(INTENT_STATES);

const selectedMechsSchema = z
  .array(addressSchema)
  .length(2)
  .superRefine((addresses, context) => {
    if (
      new Set(addresses.map((address) => address.toLowerCase())).size !==
      addresses.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Selected Mech addresses must be distinct",
      });
    }
  });

export const intentSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    id: entityIdSchema,
    organizationId: entityIdSchema,
    traceId: traceIdSchema,
    state: intentStateSchema,
    stateVersion: z.number().int().nonnegative(),
    strategy: z.literal("AAVE_V3_USDC_SUPPLY"),
    asset: z.literal("USDC"),
    chainId: baseChainIdSchema,
    amountBaseUnits: positiveBaseUnitsSchema,
    policyVersionId: entityIdSchema,
    selectedMechs: selectedMechsSchema,
    snapshotHash: contentHashSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    expiresAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((intent, context) => {
    const createdAt = Date.parse(intent.createdAt);
    if (Date.parse(intent.updatedAt) < createdAt) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt cannot precede createdAt",
      });
    }
    if (Date.parse(intent.expiresAt) <= createdAt) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "expiresAt must be later than createdAt",
      });
    }
  });

const evidenceSchema = z
  .object({
    claim: z.string().trim().min(1).max(1_000),
    source: z.url().refine((source) => source.startsWith("https://"), {
      message: "Evidence sources must use HTTPS",
    }),
  })
  .strict();

export const recommendationSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    requestId: entityIdSchema,
    deliveryId: entityIdSchema,
    resultCid: cidSchema,
    mechAddress: addressSchema,
    action: z.enum(["SUPPLY", "HOLD"]),
    asset: z.literal("USDC"),
    chainId: baseChainIdSchema,
    riskScore: riskScoreSchema,
    confidenceBps: basisPointsSchema,
    validUntil: isoTimestampSchema,
    evidence: z.array(evidenceSchema).min(1).max(20),
    reasoningSummary: z.string().trim().min(1).max(2_000),
    contentHash: contentHashSchema,
    receivedAt: isoTimestampSchema,
  })
  .strict();

export const policyRuleResultSchema = z
  .object({
    ruleId: entityIdSchema,
    passed: z.boolean(),
    reason: z.string().trim().min(1).max(1_000),
    actual: z.json().optional(),
    expected: z.json().optional(),
  })
  .strict();

export const policyEvaluationSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    id: entityIdSchema,
    intentId: entityIdSchema,
    policyVersionId: entityIdSchema,
    inputHash: contentHashSchema,
    result: z.enum(["PASSED", "REJECTED"]),
    rules: z.array(policyRuleResultSchema).min(1),
    outputHash: contentHashSchema,
    evaluatedAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((evaluation, context) => {
    const allRulesPassed = evaluation.rules.every((rule) => rule.passed);
    if ((evaluation.result === "PASSED") !== allRulesPassed) {
      context.addIssue({
        code: "custom",
        path: ["result"],
        message:
          "PASSED requires every rule to pass; any failed rule requires REJECTED",
      });
    }
  });

export const executionPlanSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    id: entityIdSchema,
    intentId: entityIdSchema,
    chainId: baseChainIdSchema,
    action: z.literal("AAVE_V3_SUPPLY"),
    asset: z.literal("USDC"),
    amountBaseUnits: positiveBaseUnitsSchema,
    token: addressSchema,
    pool: addressSchema,
    recipient: addressSchema,
    functionName: z.literal("supply"),
    arguments: z
      .object({
        asset: addressSchema,
        amountBaseUnits: positiveBaseUnitsSchema,
        onBehalfOf: addressSchema,
        referralCode: z.number().int().min(0).max(65_535),
      })
      .strict(),
    abiHash: contentHashSchema,
    valueWei: nonNegativeBaseUnitsSchema,
    planHash: contentHashSchema,
    createdAt: isoTimestampSchema,
    expiresAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((plan, context) => {
    if (plan.arguments.asset.toLowerCase() !== plan.token.toLowerCase()) {
      context.addIssue({
        code: "custom",
        path: ["arguments", "asset"],
        message: "Calldata asset must match the planned token",
      });
    }
    if (plan.arguments.amountBaseUnits !== plan.amountBaseUnits) {
      context.addIssue({
        code: "custom",
        path: ["arguments", "amountBaseUnits"],
        message: "Calldata amount must match the planned amount",
      });
    }
    if (
      plan.arguments.onBehalfOf.toLowerCase() !== plan.recipient.toLowerCase()
    ) {
      context.addIssue({
        code: "custom",
        path: ["arguments", "onBehalfOf"],
        message: "Calldata beneficiary must match the planned recipient",
      });
    }
    if (Date.parse(plan.expiresAt) <= Date.parse(plan.createdAt)) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Execution plan must expire after creation",
      });
    }
  });

export const transactionReceiptSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    id: entityIdSchema,
    intentId: entityIdSchema,
    keeperHubExecutionId: entityIdSchema,
    purpose: z.enum(["OLAS_REQUEST", "AAVE_APPROVAL", "AAVE_SUPPLY"]),
    chainId: baseChainIdSchema,
    status: z.enum(["SUCCESS", "REVERTED", "UNCONFIRMED"]),
    transactionHash: transactionHashSchema.nullable(),
    blockNumber: z.number().int().nonnegative().nullable(),
    receiptStatus: z.enum(["success", "reverted", "unknown"]),
    verified: z.boolean(),
    rawHash: contentHashSchema,
    observedAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((receipt, context) => {
    if (
      receipt.status === "SUCCESS" &&
      (!receipt.verified ||
        receipt.receiptStatus !== "success" ||
        receipt.transactionHash === null ||
        receipt.blockNumber === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message:
          "SUCCESS requires a verified successful receipt, transaction hash, and block",
      });
    }
    if (receipt.status === "REVERTED" && receipt.receiptStatus !== "reverted") {
      context.addIssue({
        code: "custom",
        path: ["receiptStatus"],
        message: "REVERTED requires a reverted receipt status",
      });
    }
    if (
      receipt.status === "UNCONFIRMED" &&
      receipt.receiptStatus !== "unknown"
    ) {
      context.addIssue({
        code: "custom",
        path: ["receiptStatus"],
        message: "UNCONFIRMED requires an unknown receipt status",
      });
    }
  });

export const proofEvidenceEntrySchema = z
  .object({
    position: z.number().int().nonnegative(),
    kind: z.enum([
      "INTENT",
      "POLICY",
      "MECH_REQUEST",
      "MECH_DELIVERY",
      "RECOMMENDATION",
      "SIMULATION",
      "EXECUTION",
      "RECEIPT",
      "POSITION_SNAPSHOT",
    ]),
    label: z.string().trim().min(1).max(200),
    contentHash: contentHashSchema,
    publicReference: z.string().trim().min(1).max(2_048).nullable(),
    recordedAt: isoTimestampSchema,
  })
  .strict();

export const proofBundleSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    id: entityIdSchema,
    publicId: entityIdSchema,
    intentId: entityIdSchema,
    traceId: traceIdSchema,
    entries: z.array(proofEvidenceEntrySchema).min(1),
    rootHash: contentHashSchema,
    createdAt: isoTimestampSchema,
  })
  .strict()
  .superRefine((bundle, context) => {
    bundle.entries.forEach((entry, index) => {
      if (entry.position !== index) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "position"],
          message: "Proof evidence positions must be contiguous and zero-based",
        });
      }
    });
  });

export const intentStateTransitionSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    intentId: entityIdSchema,
    from: intentStateSchema,
    to: intentStateSchema,
    fromVersion: z.number().int().nonnegative(),
    toVersion: z.number().int().positive(),
    actor: actorSchema,
    reason: z.string().trim().min(1).max(1_000),
    traceId: traceIdSchema,
    occurredAt: isoTimestampSchema,
    beforeHash: contentHashSchema,
    afterHash: contentHashSchema,
  })
  .strict()
  .refine((transition) => transition.toVersion === transition.fromVersion + 1, {
    path: ["toVersion"],
    message: "toVersion must increment fromVersion exactly once",
  });

export type IntentState = z.infer<typeof intentStateSchema>;
export type Intent = z.infer<typeof intentSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type PolicyRuleResult = z.infer<typeof policyRuleResultSchema>;
export type PolicyEvaluation = z.infer<typeof policyEvaluationSchema>;
export type ExecutionPlan = z.infer<typeof executionPlanSchema>;
export type TransactionReceipt = z.infer<typeof transactionReceiptSchema>;
export type ProofEvidenceEntry = z.infer<typeof proofEvidenceEntrySchema>;
export type ProofBundle = z.infer<typeof proofBundleSchema>;
export type IntentStateTransition = z.infer<typeof intentStateTransitionSchema>;
