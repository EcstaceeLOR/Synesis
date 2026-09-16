import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "./app.js";

const servers: ReturnType<typeof buildServer>[] = [];

afterEach(async () =>
  Promise.all(servers.splice(0).map(async (server) => server.close())),
);

describe("health route", () => {
  it("reports a healthy API service", async () => {
    const server = buildServer();
    servers.push(server);

    const response = await server.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "trace-health-123" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-trace-id"]).toBe("trace-health-123");
    expect(response.json()).toMatchObject({
      service: "api",
      status: "ok",
      dependencies: [
        { name: "database", healthy: true },
        { name: "keeperhub", healthy: true },
        { name: "olas", healthy: true },
      ],
    });

    const metrics = await server.inject({ method: "GET", url: "/metrics" });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers["content-type"]).toContain("text/plain");
    expect(metrics.body).toContain("synesis_lifecycle_latency_ms 0");
    expect(metrics.body).toContain("synesis_keeperhub_outcomes_total 0");
    expect(metrics.body).toContain(
      'synesis_api_requests_total{method="GET",status="200"} 1',
    );
  }, 15_000);
});
