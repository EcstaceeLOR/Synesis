import { describe, expect, it } from "vitest";

import {
  domainJsonSchemas,
  executionPlanSchema,
  intentSchema,
  policyEvaluationSchema,
  proofBundleSchema,
  recommendationSchema,
  transactionReceiptSchema,
} from "./index.js";

const ADDRESS_A = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";
const ADDRESS_C = "0x3333333333333333333333333333333333333333";
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const TRANSACTION_HASH = `0x${"c".repeat(64)}`;
const CREATED_AT = "2026-09-14T10:00:00.000Z";
const EXPIRES_AT = "2026-09-14T11:00:00.000Z";

const validIntent = {
  schemaVersion: "1.0",
  id: "intent-1",
  organizationId: "organization-1",
  traceId: "trace-1",
  state: "DRAFT",
  stateVersion: 0,
  strategy: "AAVE_V3_USDC_SUPPLY",
  asset: "USDC",
  chainId: 8453,
  amountBaseUnits: "1000000",
  policyVersionId: "policy-1",
  selectedMechs: [ADDRESS_A, ADDRESS_B],
  snapshotHash: HASH_A,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  expiresAt: EXPIRES_AT,
};

describe("canonical domain contracts", () => {
  it("accepts a valid frozen intent", () => {
    expect(intentSchema.parse(validIntent)).toMatchObject({
      state: "DRAFT",
      chainId: 8453,
      asset: "USDC",
    });
  });

  it.each([
    ["zero amount", { ...validIntent, amountBaseUnits: "0" }],
    ["unsupported chain", { ...validIntent, chainId: 1 }],
    [
      "duplicate Mechs",
      { ...validIntent, selectedMechs: [ADDRESS_A, ADDRESS_A] },
    ],
    ["expired at creation", { ...validIntent, expiresAt: CREATED_AT }],
    ["unknown fields", { ...validIntent, privateKey: "never-accepted" }],
  ])("rejects an intent with %s", (_label, value) => {
    expect(intentSchema.safeParse(value).success).toBe(false);
  });

  it("validates the normalized Olas recommendation envelope", () => {
    const recommendation = recommendationSchema.parse({
      schemaVersion: "1.0",
      requestId: "olas-request-1",
      deliveryId: "delivery-1",
      resultCid: "bafybeigdyrzt-example-result-cid",
      mechAddress: ADDRESS_A,
      action: "SUPPLY",
      asset: "USDC",
      chainId: 8453,
      riskScore: 20,
      confidenceBps: 8_500,
      validUntil: EXPIRES_AT,
      evidence: [
        {
          claim: "Utilization is within policy",
          source: "https://example.com/evidence",
        },
      ],
      reasoningSummary: "The bounded supply action satisfies the risk policy.",
      contentHash: HASH_A,
      receivedAt: CREATED_AT,
    });

    expect(recommendation.confidenceBps).toBe(8_500);
    expect(
      recommendationSchema.safeParse({
        ...recommendation,
        evidence: [
          { claim: "Untrusted", source: "http://example.com/evidence" },
        ],
      }).success,
    ).toBe(false);
    expect(
      recommendationSchema.safeParse({
        ...recommendation,
        confidenceBps: 10_001,
      }).success,
    ).toBe(false);
  });

  it("enforces deterministic policy result consistency", () => {
    const evaluation = {
      schemaVersion: "1.0",
      id: "evaluation-1",
      intentId: "intent-1",
      policyVersionId: "policy-1",
      inputHash: HASH_A,
      result: "PASSED",
      rules: [
        { ruleId: "minimum-confidence", passed: true, reason: "8500 >= 7000" },
      ],
      outputHash: HASH_B,
      evaluatedAt: CREATED_AT,
    };

    expect(policyEvaluationSchema.safeParse(evaluation).success).toBe(true);
    expect(
      policyEvaluationSchema.safeParse({
        ...evaluation,
        rules: [
          {
            ruleId: "minimum-confidence",
            passed: false,
            reason: "Below threshold",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("binds an execution plan to its exact token, amount, and beneficiary", () => {
    const plan = {
      schemaVersion: "1.0",
      id: "plan-1",
      intentId: "intent-1",
      chainId: 8453,
      action: "AAVE_V3_SUPPLY",
      asset: "USDC",
      amountBaseUnits: "1000000",
      token: ADDRESS_A,
      pool: ADDRESS_B,
      recipient: ADDRESS_C,
      functionName: "supply",
      arguments: {
        asset: ADDRESS_A,
        amountBaseUnits: "1000000",
        onBehalfOf: ADDRESS_C,
        referralCode: 0,
      },
      abiHash: HASH_A,
      valueWei: "0",
      planHash: HASH_B,
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    };

    expect(executionPlanSchema.safeParse(plan).success).toBe(true);
    expect(
      executionPlanSchema.safeParse({
        ...plan,
        arguments: { ...plan.arguments, amountBaseUnits: "2000000" },
      }).success,
    ).toBe(false);
  });

  it("does not classify a transaction as successful without all receipt proofs", () => {
    const receipt = {
      schemaVersion: "1.0",
      id: "receipt-1",
      intentId: "intent-1",
      keeperHubExecutionId: "kh-execution-1",
      purpose: "AAVE_SUPPLY",
      chainId: 8453,
      status: "SUCCESS",
      transactionHash: TRANSACTION_HASH,
      blockNumber: 25_000_000,
      receiptStatus: "success",
      verified: true,
      rawHash: HASH_A,
      observedAt: CREATED_AT,
    };

    expect(transactionReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(
      transactionReceiptSchema.safeParse({ ...receipt, verified: false })
        .success,
    ).toBe(false);
    expect(
      transactionReceiptSchema.safeParse({
        ...receipt,
        status: "UNCONFIRMED",
        receiptStatus: "success",
      }).success,
    ).toBe(false);
  });

  it("requires proof entries to be ordered contiguously", () => {
    const proof = {
      schemaVersion: "1.0",
      id: "proof-1",
      publicId: "public-proof-1",
      intentId: "intent-1",
      traceId: "trace-1",
      entries: [
        {
          position: 0,
          kind: "INTENT",
          label: "Frozen intent",
          contentHash: HASH_A,
          publicReference: null,
          recordedAt: CREATED_AT,
        },
        {
          position: 1,
          kind: "RECEIPT",
          label: "Verified receipt",
          contentHash: HASH_B,
          publicReference: "https://basescan.org/tx/example",
          recordedAt: CREATED_AT,
        },
      ],
      rootHash: HASH_B,
      createdAt: CREATED_AT,
    };

    expect(proofBundleSchema.safeParse(proof).success).toBe(true);
    expect(
      proofBundleSchema.safeParse({
        ...proof,
        entries: proof.entries.map((entry, index) =>
          index === 1 ? { ...entry, position: 3 } : entry,
        ),
      }).success,
    ).toBe(false);
  });

  it("exports JSON Schema representations for every shared boundary", () => {
    expect(Object.keys(domainJsonSchemas)).toEqual([
      "intent",
      "recommendation",
      "policyEvaluation",
      "executionPlan",
      "transactionReceipt",
      "proofBundle",
      "intentStateTransition",
    ]);
    for (const schema of Object.values(domainJsonSchemas)) {
      expect(typeof schema.$schema).toBe("string");
      expect(schema.$schema).toContain("json-schema");
    }
  });
});
