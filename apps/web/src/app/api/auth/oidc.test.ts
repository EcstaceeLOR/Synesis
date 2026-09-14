import { describe, expect, it } from "vitest";

import { readIdTokenNonce, safeReturnTo } from "./oidc.js";

describe("OIDC browser flow helpers", () => {
  it("rejects external and protocol-relative post-login redirects", () => {
    expect(safeReturnTo("https://attacker.test")).toBe("/app");
    expect(safeReturnTo("//attacker.test/app")).toBe("/app");
    expect(safeReturnTo("/settings")).toBe("/app");
    expect(safeReturnTo("/app/intents?state=open")).toBe(
      "/app/intents?state=open",
    );
  });

  it("reads the nonce only from a structurally valid ID-token payload", () => {
    const payload = Buffer.from(
      JSON.stringify({ nonce: "nonce-123" }),
    ).toString("base64url");
    expect(readIdTokenNonce(`header.${payload}.signature`)).toBe("nonce-123");
    expect(readIdTokenNonce("not-a-jwt")).toBeUndefined();
  });
});
