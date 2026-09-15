import { afterEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "./app.js";
import { OlasMechDirectoryClient } from "./mechs.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const directory = {
  chainId: 8453 as const,
  status: "ready" as const,
  source: "olas-mech-client" as const,
  observedAt: "2026-09-15T10:00:00.000Z",
  observedVersion: "base-2026-09-15.2",
  mechs: [
    {
      chainId: 8453 as const,
      address: ADDRESS,
      serviceId: 112,
      factoryAddress: "0x2222222222222222222222222222222222222222",
      name: "Live Mech",
      description: "Onchain provider",
      metadataCid: `f01701220${"a".repeat(64)}`,
      paymentType: "USDC_TOKEN",
      unitAmount: 100_000,
      paymentDecimals: 6 as const,
      totalDeliveries: 100,
      health: "active" as const,
      eligible: true,
      compatibilityScore: 100,
      reasons: [],
      tools: [],
      observedAt: "2026-09-15T10:00:00.000Z",
      observedVersion: "base-2026-09-15.2",
    },
  ],
};

const servers: ReturnType<typeof buildServer>[] = [];
afterEach(async () =>
  Promise.all(servers.splice(0).map(async (server) => server.close())),
);

describe("live Mech read API", () => {
  it("lists and resolves only discovered full addresses", async () => {
    const server = buildServer({
      mechDirectory: { read: () => Promise.resolve(directory) },
    });
    servers.push(server);

    expect(
      (await server.inject({ method: "GET", url: "/api/v1/mechs" })).json(),
    ).toEqual(directory);
    expect(
      (
        await server.inject({ method: "GET", url: `/api/v1/mechs/${ADDRESS}` })
      ).json(),
    ).toMatchObject({ serviceId: 112 });
    expect(
      (await server.inject({ method: "GET", url: "/api/v1/mechs/0xshort" }))
        .statusCode,
    ).toBe(400);
  }, 15_000);

  it("maps the private adapter contract and caches it", async () => {
    const response = {
      chain_id: 8453,
      status: "empty",
      source: "olas-mech-client",
      observed_at: "2026-09-15T10:00:00.000Z",
      observed_version: "base-2026-09-15.2",
      mechs: [],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(response), { status: 200 }),
      );
    const client = new OlasMechDirectoryClient({
      origin: "http://olas-adapter:8100",
      token: "secret",
      fetch: fetcher,
      now: () => 100,
    });

    expect((await client.read()).status).toBe("empty");
    await client.read();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
