import { describe, expect, it } from "vitest";

import { createPublicProofBundle, verifyPublicProofBundle } from "./proofs.js";

const createdAt = "2026-09-16T00:00:00.000Z";

describe("canonical public proof bundles", () => {
  it("redacts private fields and independently verifies every entry and root", async () => {
    const bundle = await createPublicProofBundle({
      id: "proof-1",
      publicId: "PRF-1",
      intentId: "intent-1",
      traceId: "trace-1",
      createdAt,
      artifacts: [
        {
          kind: "INTENT",
          label: "Frozen intent",
          payload: {
            amount: "100",
            organizationId: "private",
            apiKey: "secret",
          },
          recordedAt: createdAt,
        },
        {
          kind: "RECEIPT",
          label: "Base receipt",
          payload: { transactionHash: `0x${"11".repeat(32)}` },
          publicReference: `https://basescan.org/tx/0x${"11".repeat(32)}`,
          recordedAt: createdAt,
        },
      ],
    });
    expect(JSON.stringify(bundle)).not.toContain("private");
    expect((await verifyPublicProofBundle(bundle)).valid).toBe(true);
  });

  it("makes entry tampering an obvious verification failure", async () => {
    const bundle = await createPublicProofBundle({
      id: "proof-2",
      publicId: "PRF-2",
      intentId: "intent-2",
      traceId: "trace-2",
      createdAt,
      artifacts: [
        {
          kind: "POSITION_SNAPSHOT",
          label: "Aave delta",
          payload: { increase: "100" },
          recordedAt: createdAt,
        },
      ],
    });
    const tampered = {
      ...bundle,
      entries: [{ ...bundle.entries[0]!, payload: { increase: "999" } }],
    };
    const result = await verifyPublicProofBundle(tampered);
    expect(result.valid).toBe(false);
    expect(result.invalidPositions).toEqual([0]);
  });
});
