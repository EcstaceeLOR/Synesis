import { describe, expect, it } from "vitest";

import { workerHealth } from "./health.js";

describe("worker health", () => {
  it("identifies the execution queue", () => {
    expect(workerHealth()).toMatchObject({
      service: "worker",
      status: "ok",
      queue: "synesis-coordinator",
    });
  });
});
