import { describe, expect, it } from "vitest";

import {
  computeBoundedBackoff,
  COORDINATOR_RETRY_POLICY,
  getStateDeadline,
  INTENT_STATE_TIMEOUT_MS,
  outboxJobId,
  parseCoordinatorJobData,
} from "./index.js";

describe("coordinator queue policy", () => {
  it("uses capped exponential backoff with bounded jitter", () => {
    expect(computeBoundedBackoff(1, () => 0)).toBe(650);
    expect(computeBoundedBackoff(2, () => 1)).toBe(2_000);
    expect(computeBoundedBackoff(50, () => 1)).toBe(
      COORDINATOR_RETRY_POLICY.maxDelayMs,
    );
    expect(computeBoundedBackoff(50, () => 0)).toBe(39_000);
  });

  it("assigns state-specific deadlines", () => {
    const enteredAt = "2026-09-14T10:00:00.000Z";
    expect(getStateDeadline("QUOTING", enteredAt)).toBe(
      Date.parse(enteredAt) + INTENT_STATE_TIMEOUT_MS.QUOTING,
    );
    expect(INTENT_STATE_TIMEOUT_MS.AWAITING_APPROVAL).toBeGreaterThan(
      INTENT_STATE_TIMEOUT_MS.QUOTING,
    );
    expect(INTENT_STATE_TIMEOUT_MS.UNCONFIRMED).toBeGreaterThan(
      INTENT_STATE_TIMEOUT_MS.EXECUTING,
    );
  });

  it("derives stable Redis-safe job IDs from outbox IDs", () => {
    expect(outboxJobId("intent:123:v1")).toBe("outbox-intent-123-v1");
  });

  it("rejects malformed or unknown-state queue payloads", () => {
    expect(() => parseCoordinatorJobData({ state: "DRAFT" })).toThrow(
      "malformed",
    );
    expect(() =>
      parseCoordinatorJobData({
        schemaVersion: "1.0",
        name: "intent.advance",
        outboxId: "outbox-1",
        intentId: "intent-1",
        traceId: "trace-1",
        state: "NOT_A_STATE",
        stateVersion: 0,
        stateEnteredAt: "2026-09-14T10:00:00.000Z",
      }),
    ).toThrow();
  });
});
