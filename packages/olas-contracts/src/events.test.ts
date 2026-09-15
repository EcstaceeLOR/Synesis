import { describe, expect, it } from "vitest";

import {
  MARKETPLACE_REQUEST_TOPIC,
  extractMarketplaceRequestId,
  type Address,
  type Hex,
} from "./index.js";

const marketplace: Address = `0x${"11".repeat(20)}`;
const mech: Address = `0x${"22".repeat(20)}`;
const requester: Address = `0x${"33".repeat(20)}`;
const requestId: Hex = `0x${"44".repeat(32)}`;
const addressTopic = (address: Address) =>
  `0x${address.slice(2).padStart(64, "0")}`;
const word = (value: bigint) => value.toString(16).padStart(64, "0");
const data = `0x${word(1n)}${word(96n)}${word(160n)}${word(1n)}${requestId.slice(2)}${word(0n)}`;

describe("Olas MarketplaceRequest event extraction", () => {
  it("extracts one request ID bound to the selected Mech and KeeperHub wallet", () => {
    expect(
      extractMarketplaceRequestId({
        marketplaceAddress: marketplace,
        expectedMech: mech,
        expectedRequester: requester,
        logs: [
          {
            address: marketplace,
            topics: [
              MARKETPLACE_REQUEST_TOPIC,
              addressTopic(mech),
              addressTopic(requester),
            ],
            data,
          },
        ],
      }),
    ).toBe(requestId);
  });

  it.each([
    ["wrong requester", addressTopic(`0x${"55".repeat(20)}`), data],
    [
      "zero request",
      addressTopic(requester),
      data.replace(requestId.slice(2), "0".repeat(64)),
    ],
    ["batch", addressTopic(requester), data.replace(word(1n), word(2n))],
  ])("rejects %s evidence", (_label, requesterTopic, eventData) => {
    expect(() =>
      extractMarketplaceRequestId({
        marketplaceAddress: marketplace,
        expectedMech: mech,
        expectedRequester: requester,
        logs: [
          {
            address: marketplace,
            topics: [
              MARKETPLACE_REQUEST_TOPIC,
              addressTopic(mech),
              requesterTopic,
            ],
            data: eventData as Hex,
          },
        ],
      }),
    ).toThrow();
  });
});
