import { describe, expect, it } from "vitest";

import { OPERATIONAL_STATE_COPY } from "./index.js";

describe("operational view states", () => {
  it("provides accessible copy for every required state", () => {
    expect(Object.keys(OPERATIONAL_STATE_COPY).sort()).toEqual([
      "empty",
      "error",
      "failed",
      "loading",
      "partial",
      "rejected",
      "unconfirmed",
    ]);
    for (const copy of Object.values(OPERATIONAL_STATE_COPY)) {
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.message.length).toBeGreaterThan(0);
    }
  });
});
