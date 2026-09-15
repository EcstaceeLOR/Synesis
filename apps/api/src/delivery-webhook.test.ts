import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { SynesisStore } from "@synesis/database";
import { canonicalJson } from "@synesis/domain";

import {
  acceptOlasDelivery,
  parseDeliveryWebhook,
} from "./delivery-webhook.js";

const payload = parseDeliveryWebhook({
  type: "olas.delivery",
  requestId: "0x" + "11".repeat(32),
  deliveryReference: "cid:42",
  block: 123,
  transactionHash: "0x" + "22".repeat(32),
  timestamp: "2026-09-15T22:00:00.000Z",
  nonce: "a".repeat(32),
  body: { decision: "supply" },
});

const store = (accepted: boolean) =>
  ({
    transaction: async (
      callback: (repositories: unknown) => Promise<boolean>,
    ) => callback({ events: { accept: () => Promise.resolve(accepted) } }),
  }) as unknown as SynesisStore;

describe("signed Olas delivery webhook", () => {
  it("accepts a fresh signed delivery and deduplicates replays", async () => {
    const raw = canonicalJson(payload);
    const signature = `sha256=${createHmac("sha256", "secret").update(raw).digest("hex")}`;
    const result = await acceptOlasDelivery({
      store: store(true),
      payload,
      signature,
      secret: "secret",
      now: new Date("2026-09-15T22:01:00.000Z"),
    });
    expect(result.accepted).toBe(true);
    expect(result.eventKey).toContain("cid:42");
  });

  it("rejects invalid signatures and expired deliveries", async () => {
    await expect(
      acceptOlasDelivery({
        store: store(true),
        payload,
        signature: "sha256=00",
        secret: "secret",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE", statusCode: 401 });
    await expect(
      acceptOlasDelivery({
        store: store(true),
        payload,
        signature: `sha256=${createHmac("sha256", "secret").update(canonicalJson(payload)).digest("hex")}`,
        secret: "secret",
        now: new Date("2026-09-15T23:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "DELIVERY_EXPIRED" });
  });
});
