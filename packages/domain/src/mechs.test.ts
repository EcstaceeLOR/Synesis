import { describe, expect, it } from "vitest";

import { freezeMechSelections, mechDirectorySchema } from "./mechs.js";

const address = (digit: string) => `0x${digit.repeat(40)}`;
const hash = (digit: string) => `sha256:${digit.repeat(64)}`;
const observedAt = "2026-09-15T10:00:00.000Z";
const eligible = (digit: string, serviceId: number) => ({
  chainId: 8453,
  address: address(digit),
  serviceId,
  factoryAddress: address("9"),
  name: `Mech ${serviceId}`,
  description: "Verified test Mech",
  metadataCid: `f01701220${digit.repeat(64)}`,
  paymentType: "USDC_TOKEN",
  unitAmount: 100_000,
  paymentDecimals: 6,
  totalDeliveries: 12,
  health: "active",
  eligible: true,
  compatibilityScore: 100,
  reasons: [],
  tools: [
    {
      name: "risk",
      description: "Risk analysis",
      inputSchema: { type: "string" },
      outputSchema: { type: "object" },
      schemaHash: hash(digit),
    },
  ],
  observedAt,
  observedVersion: "base-2026-09-15.2",
});

const directory = mechDirectorySchema.parse({
  chainId: 8453,
  status: "ready",
  source: "olas-mech-client",
  observedAt,
  observedVersion: "base-2026-09-15.2",
  mechs: [eligible("1", 1), eligible("2", 2)],
});

describe("Mech compatibility snapshots", () => {
  it("freezes two independent eligible metadata and schema versions", async () => {
    const result = await freezeMechSelections(directory, [
      { mechAddress: address("1"), tool: "risk" },
      { mechAddress: address("2"), tool: "risk" },
    ]);

    expect(result.snapshotHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(result.selections[0]).toMatchObject({
      metadataCid: `f01701220${"1".repeat(64)}`,
      toolSchemaHash: hash("1"),
      observedVersion: "base-2026-09-15.2",
    });
  });

  it("rejects duplicates, incompatible Mechs, and unknown tools", async () => {
    await expect(
      freezeMechSelections(directory, [
        { mechAddress: address("1"), tool: "risk" },
        { mechAddress: address("1"), tool: "risk" },
      ]),
    ).rejects.toThrow("independent");
    await expect(
      freezeMechSelections(
        { ...directory, mechs: [{ ...directory.mechs[0], eligible: false }] },
        [
          { mechAddress: address("1"), tool: "risk" },
          { mechAddress: address("2"), tool: "risk" },
        ],
      ),
    ).rejects.toThrow("not eligible");
  });
});
