import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy, SESSION_COOKIE } from "./proxy.js";

describe("authenticated application boundary", () => {
  it("redirects anonymous application requests to login", () => {
    const response = proxy(new NextRequest("https://synesis.test/app/intents"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://synesis.test/login?returnTo=%2Fapp%2Fintents",
    );
  });

  it("allows requests carrying the opaque session cookie", () => {
    const request = new NextRequest("https://synesis.test/app", {
      headers: { cookie: `${SESSION_COOKIE}=opaque-session-token` },
    });

    expect(proxy(request).headers.get("x-middleware-next")).toBe("1");
  });
});
