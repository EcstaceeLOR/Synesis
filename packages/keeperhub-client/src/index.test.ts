import { describe, expect, it, vi } from "vitest";

import { KeeperHubApiError, KeeperHubClient } from "./index.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("KeeperHubClient", () => {
  it("uses the authenticated key probe and reads the organization wallet", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          items: [
            {
              id: "key-1",
              keyPrefix: "kh_live",
              scope: "mcp:read mcp:write",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({ walletAddress: "0x1111111111111111111111111111111111111111" }),
      );
    const client = new KeeperHubClient({
      apiKey: "kh_example1234",
      fetch: fetcher,
    });

    await expect(client.listKeys()).resolves.toMatchObject([
      { scopes: ["mcp:read", "mcp:write"] },
    ]);
    await expect(client.getWallet()).resolves.toMatchObject({
      walletAddress: "0x1111111111111111111111111111111111111111",
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://app.keeperhub.com/api/keys?limit=100",
    );
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: "Bearer kh_example1234",
    });
  });

  it("turns a revoked key into an actionable error", async () => {
    const client = new KeeperHubClient({
      apiKey: "kh_example1234",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(json({}, 401)),
    });
    await expect(client.listKeys()).rejects.toBeInstanceOf(KeeperHubApiError);
    await expect(client.listKeys()).rejects.toMatchObject({
      status: 401,
      message: "KeeperHub rejected this key; create a new organization key",
    });
  });
});
