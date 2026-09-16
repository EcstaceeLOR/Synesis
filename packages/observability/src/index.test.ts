import { describe, expect, it } from "vitest";

import {
  dependencyHealth,
  evaluateOperationalAlerts,
  MetricsRegistry,
  structuredLog,
} from "./index.js";

describe("operational observability", () => {
  it("emits trace-correlated logs without secrets", () => {
    const line = structuredLog({
      level: "info",
      event: "keeperhub.broadcast",
      context: { traceId: "trace-1", executionId: "exec-1" },
      details: { apiKey: "secret", status: "verified" },
      occurredAt: "2026-09-16T00:00:00.000Z",
    });
    expect(line).toContain("trace-1");
    expect(line).not.toContain("secret");
  });
  it("renders stable metrics and every required alert", () => {
    const metrics = new MetricsRegistry();
    metrics.increment("keeperhub_outcomes_total", { outcome: "verified" });
    expect(metrics.render()).toContain(
      'keeperhub_outcomes_total{outcome="verified"} 1',
    );
    expect(
      evaluateOperationalAlerts({
        dependencyFailures: 1,
        stuckIntents: 1,
        unexpectedCalls: 1,
        unconfirmedWrites: 1,
        treasuryBalance: 1n,
        minimumTreasuryBalance: 2n,
        proofMismatches: 1,
      }),
    ).toHaveLength(6);
    expect(
      dependencyHealth([
        { name: "database", healthy: true, critical: true },
        { name: "ipfs", healthy: false, critical: false },
      ]).status,
    ).toBe("degraded");
  });
});
