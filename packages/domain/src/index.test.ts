import { describe, expect, it } from "vitest";

import { createServiceHealth } from "./index";

describe("createServiceHealth", () => {
  it("produces a valid service health record", () => {
    const health = createServiceHealth("api", "demo", "0.1.0");

    expect(health.service).toBe("api");
    expect(health.status).toBe("ok");
    expect(health.environment).toBe("demo");
  });
});
