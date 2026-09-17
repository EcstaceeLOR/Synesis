import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { proxy, SESSION_COOKIE } from "./proxy.js";

describe("authenticated application boundary", () => {
  afterEach(() => {
    delete process.env.SYNESIS_MODE;
  });

  it("allows anonymous judges to explore the no-funds demo", () => {
    const response = proxy(new NextRequest("https://synesis.test/app/intents"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects anonymous live application requests to login", () => {
    process.env.SYNESIS_MODE = "live";
    const response = proxy(new NextRequest("https://synesis.test/app/intents"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://synesis.test/login?returnTo=%2Fapp%2Fintents",
    );
  });

  it("allows live requests carrying the opaque session cookie", () => {
    process.env.SYNESIS_MODE = "live";
    const request = new NextRequest("https://synesis.test/app", {
      headers: { cookie: `${SESSION_COOKIE}=opaque-session-token` },
    });

    expect(proxy(request).headers.get("x-middleware-next")).toBe("1");
  });
});
