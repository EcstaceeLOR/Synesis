import { describe, expect, it } from "vitest";

import { isNavigationItemActive, navigationItems } from "./navigation.js";

describe("application navigation", () => {
  it("reaches every static application route in Architecture section 6", () => {
    expect(navigationItems.map((item) => item.href)).toEqual([
      "/app",
      "/app/intents",
      "/app/intents/new",
      "/app/mechs",
      "/app/policies",
      "/app/executions",
      "/app/treasury",
      "/app/proofs",
      "/app/settings/integrations",
      "/app/settings/security",
    ]);
  });

  it("does not mark the command center active on every application page", () => {
    expect(isNavigationItemActive("/app", "/app")).toBe(true);
    expect(isNavigationItemActive("/app/intents/abc", "/app")).toBe(false);
    expect(isNavigationItemActive("/app/intents/abc", "/app/intents")).toBe(
      true,
    );
    expect(isNavigationItemActive("/app/intents/new", "/app/intents")).toBe(
      false,
    );
  });
});
