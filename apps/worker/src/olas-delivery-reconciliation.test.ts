import { describe, expect, it } from "vitest";

import { hashCanonicalJson } from "@synesis/domain";

import { validateOlasDeliveryResult } from "./olas-delivery-reconciliation.js";

describe("Olas delivery result validation", () => {
  const requestId = "delivery-request-1";
  const mechAddress = `0x${"11".repeat(20)}`;
  const validDelivery = async () => {
    const result = {
      schemaVersion: "1.0" as const,
      requestId,
      deliveryId: "delivery-1",
      resultCid: "f01701220" + "22".repeat(32),
      mechAddress,
      action: "SUPPLY" as const,
      asset: "USDC" as const,
      chainId: 8453,
      riskScore: 20,
      confidenceBps: 9_100,
      validUntil: "2099-01-01T00:00:00.000Z",
      evidence: [
        {
          claim:
            "The bounded supply recommendation is within the pinned policy.",
          source: "https://gateway.autonolas.tech/ipfs/fixture",
        },
      ],
      reasoningSummary: "Recorded Olas/IPFS delivery fixture.",
      contentHash: "",
      receivedAt: "2026-09-16T00:00:00.000Z",
    };
    return {
      ...result,
      contentHash: await hashCanonicalJson({
        ...result,
        contentHash: undefined,
      }),
    };
  };

  it("accepts a recorded JSON/IPFS delivery only when every binding matches", async () => {
    const delivery = await validDelivery();
    await expect(
      validateOlasDeliveryResult({
        value: delivery,
        expectedRequestId: requestId,
        expectedMech: mechAddress,
        expectedContentHash: delivery.contentHash,
      }),
    ).resolves.toMatchObject({ action: "SUPPLY", asset: "USDC" });
  });

  it("rejects free-form and cross-request content before quorum", async () => {
    await expect(
      validateOlasDeliveryResult({
        value: "execute 0xdeadbeef",
        expectedRequestId: "r1",
        expectedMech: "0x" + "11".repeat(20),
      }),
    ).rejects.toThrow("JSON object");

    const delivery = await validDelivery();
    await expect(
      validateOlasDeliveryResult({
        value: delivery,
        expectedRequestId: "another-request",
        expectedMech: mechAddress,
      }),
    ).rejects.toThrow("different request");
    await expect(
      validateOlasDeliveryResult({
        value: delivery,
        expectedRequestId: requestId,
        expectedMech: `0x${"33".repeat(20)}`,
      }),
    ).rejects.toThrow("different Mech");
  });

  it("fails closed for schema, content-hash, staleness, and size attacks", async () => {
    const delivery = await validDelivery();
    await expect(
      validateOlasDeliveryResult({
        value: { ...delivery, asset: "ETH" },
        expectedRequestId: requestId,
        expectedMech: mechAddress,
      }),
    ).rejects.toThrow("pinned recommendation schema");
    await expect(
      validateOlasDeliveryResult({
        value: { ...delivery, reasoningSummary: "tampered" },
        expectedRequestId: requestId,
        expectedMech: mechAddress,
      }),
    ).rejects.toThrow("content hash is invalid");
    const stale = { ...delivery, validUntil: "2020-01-01T00:00:00.000Z" };
    const signedStale = {
      ...stale,
      contentHash: await hashCanonicalJson({
        ...stale,
        contentHash: undefined,
      }),
    };
    await expect(
      validateOlasDeliveryResult({
        value: signedStale,
        expectedRequestId: requestId,
        expectedMech: mechAddress,
      }),
    ).rejects.toThrow("stale");
    await expect(
      validateOlasDeliveryResult({
        value: delivery,
        expectedRequestId: requestId,
        expectedMech: mechAddress,
        maxBytes: 10,
      }),
    ).rejects.toThrow("size limit");
  });
});
