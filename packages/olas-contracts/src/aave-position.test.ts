import { describe, expect, it } from "vitest";

import { verifyAaveSupplyIncrease } from "./aave-position.js";

describe("Aave position verification", () => {
  it("requires both wallet spend and aUSDC increase", () => {
    expect(
      verifyAaveSupplyIncrease({
        before: { walletUsdcBalance: 1000n, aUsdcBalance: 200n },
        after: { walletUsdcBalance: 900n, aUsdcBalance: 300n },
        expectedAmount: 100n,
      }),
    ).toEqual({ usdcSpent: 100n, aUsdcIncrease: 100n });
  });
  it("rejects a receipt without the expected position delta", () => {
    expect(() =>
      verifyAaveSupplyIncrease({
        before: { walletUsdcBalance: 1000n, aUsdcBalance: 200n },
        after: { walletUsdcBalance: 950n, aUsdcBalance: 220n },
        expectedAmount: 100n,
      }),
    ).toThrow();
  });
});
