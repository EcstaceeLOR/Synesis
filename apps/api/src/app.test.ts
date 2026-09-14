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

    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ service: "api", status: "ok" });
  }, 15_000);
});
