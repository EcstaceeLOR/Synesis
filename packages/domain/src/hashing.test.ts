import { describe, expect, it } from "vitest";

import { canonicalJson, hashCanonicalJson } from "./index.js";

describe("canonical JSON hashing", () => {
  it("is stable across object key order at every depth", async () => {
    const left = { z: 1, nested: { b: true, a: [3, 2, 1] } };
    const right = { nested: { a: [3, 2, 1], b: true }, z: 1 };

    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(await hashCanonicalJson(left)).toBe(await hashCanonicalJson(right));
  });

  it("produces the SHA-256 digest for a known canonical payload", async () => {
    await expect(hashCanonicalJson({ a: 1 })).resolves.toBe(
      "sha256:015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862",
    );
  });
});
