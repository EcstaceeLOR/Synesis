import { describe, expect, it } from "vitest";

import { evaluateRecommendationQuorum } from "./quorum.js";

const base = {
  schemaVersion: "1.0" as const,
  requestId: "request-1",
  deliveryId: "delivery-1",
  resultCid: "bafyresult",
  mechAddress: "0x1111111111111111111111111111111111111111",
  action: "SUPPLY" as const,
  asset: "USDC" as const,
  chainId: 8453 as const,
  riskScore: 20,
  confidenceBps: 9000,
  validUntil: "2026-09-15T23:00:00.000Z",
  evidence: [{ claim: "signal", source: "https://example.com/evidence" }],
  reasoningSummary: "bounded",
  contentHash: "sha256:" + "11".repeat(32),
  receivedAt: "2026-09-15T22:00:00.000Z",
};

describe("deterministic recommendation quorum", () => {
  it("passes only when two independent recommendations agree", async () => {
    const result = await evaluateRecommendationQuorum({
      intentId: "intent-1",
      policyVersionId: "policy-1",
      requestId: "request-1",
      amountBaseUnits: "100",
      policy: {
        minimumConfidenceBps: 8000,
        maximumRiskScore: 50,
        maximumRiskDivergence: 10,
        maximumAmountBaseUnits: "1000",
        freshnessWindowSeconds: 3600,
      },
      evaluatedAt: "2026-09-15T22:01:00.000Z",
      recommendations: [
        base,
        {
          ...base,
          deliveryId: "delivery-2",
          mechAddress: "0x2222222222222222222222222222222222222222",
        },
      ],
    });
    expect(result.result).toBe("PASSED");
    expect(result.rules.every((candidate) => candidate.passed)).toBe(true);
  });

  it("rejects disagreement and never substitutes an action", async () => {
    const result = await evaluateRecommendationQuorum({
      intentId: "intent-1",
      policyVersionId: "policy-1",
      requestId: "request-1",
      amountBaseUnits: "100",
      policy: {
        minimumConfidenceBps: 8000,
        maximumRiskScore: 50,
        maximumRiskDivergence: 10,
        maximumAmountBaseUnits: "1000",
        freshnessWindowSeconds: 3600,
      },
      evaluatedAt: "2026-09-15T22:01:00.000Z",
      recommendations: [
        base,
        {
          ...base,
          deliveryId: "delivery-2",
          mechAddress: "0x2222222222222222222222222222222222222222",
          action: "HOLD",
        },
      ],
    });
    expect(result.result).toBe("REJECTED");
    expect(
      result.rules.find((candidate) => candidate.ruleId === "supply_agreement")
        ?.passed,
    ).toBe(false);
  });
});
