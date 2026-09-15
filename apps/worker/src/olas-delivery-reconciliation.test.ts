import { describe, expect, it } from "vitest";

import { validateOlasDeliveryResult } from "./olas-delivery-reconciliation.js";

describe("Olas delivery result validation", () => {
  it("rejects free-form and cross-request content before quorum", async () => {
    await expect(
      validateOlasDeliveryResult({
        value: "execute 0xdeadbeef",
        expectedRequestId: "r1",
        expectedMech: "0x" + "11".repeat(20),
      }),
    ).rejects.toThrow("JSON object");
  });
});
