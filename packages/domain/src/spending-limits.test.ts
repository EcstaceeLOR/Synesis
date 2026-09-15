import { describe, expect, it } from "vitest";

import { evaluateSpendingLimits } from "./spending-limits.js";

describe("spending limits", () => {
  const policy = {
    maxPerIntent: 1000n,
    maxDaily: 1500n,
    maxStrategyExposure: 2000n,
    approvalThreshold: 500n,
  };
  it("requires approval and blocks aggregate races", () => {
    expect(
      evaluateSpendingLimits(policy, {
        intentAmount: 600n,
        dailyCommitted: 901n,
        strategyCommitted: 0n,
        approved: false,
      }),
    ).toMatchObject({
      allowed: false,
      approvalRequired: true,
      reasons: ["DAILY_LIMIT", "APPROVER_REQUIRED"],
    });
  });
  it("allows a bounded approved intent", () => {
    expect(
      evaluateSpendingLimits(policy, {
        intentAmount: 400n,
        dailyCommitted: 500n,
        strategyCommitted: 200n,
        approved: false,
      }).allowed,
    ).toBe(true);
  });
});
