import { randomBytes } from "node:crypto";
import type { SynesisStore } from "@synesis/database";
import { describe, expect, it, vi } from "vitest";

import {
  EnvelopeEncryption,
  IntegrationService,
  validateIntegrationCredentials,
} from "./integrations.js";

describe("integration credential protection", () => {
  it("encrypts with authenticated context and never embeds plaintext", () => {
    const encryption = new EnvelopeEncryption(
      randomBytes(32).toString("base64"),
    );
    const encrypted = encryption.encrypt("kh_super_secret", "org-1:onboarding");
    expect(JSON.stringify(encrypted)).not.toContain("kh_super_secret");
    expect(encryption.decrypt(encrypted, "org-1:onboarding")).toBe(
      "kh_super_secret",
    );
    expect(() => encryption.decrypt(encrypted, "org-2:onboarding")).toThrow();
  });

  it("rejects non-TLS upstreams and weak webhook secrets", () => {
    expect(() =>
      validateIntegrationCredentials({
        keeperHubApiKey: "kh_example1234",
        baseRpcUrl: "http://rpc.example.com",
        ipfsGatewayUrl: "https://ipfs.example.com",
        deliveryWebhookUrl: "https://hooks.example.com/delivery",
        deliveryWebhookSecret: "short",
      }),
    ).toThrow();
  });
});

describe("live onboarding checks", () => {
  it("becomes ready only after all nine read-only checks pass", async () => {
    const captured: {
      secret?: Record<string, unknown>;
      checks: Record<string, unknown>[];
      readiness?: Record<string, unknown>;
    } = { checks: [] };
    const repositories = {
      integrationSecrets: {
        upsert: vi.fn((input: Record<string, unknown>) => {
          captured.secret = input;
          return Promise.resolve();
        }),
      },
      integrationConnections: { upsert: vi.fn(() => Promise.resolve()) },
      integrationHealthChecks: {
        upsert: vi.fn((input: Record<string, unknown>) => {
          captured.checks.push(input);
          return Promise.resolve();
        }),
      },
      walletSnapshots: { create: vi.fn(() => Promise.resolve()) },
      organizations: {
        setIntegrationReadiness: vi.fn((input: Record<string, unknown>) => {
          captured.readiness = input;
          return Promise.resolve();
        }),
      },
    };
    const store = {
      read: {},
      transaction: async (
        work: (value: typeof repositories) => Promise<unknown>,
      ) => work(repositories),
      close: vi.fn(),
    } as unknown as SynesisStore;
    const rpcMethods: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      await Promise.resolve();
      const href = url instanceof Request ? url.url : url.toString();
      if (href.includes("/api/keys"))
        return Response.json({
          items: [
            {
              id: "key",
              keyPrefix: "kh_examp",
              scopes: ["mcp:read", "mcp:write"],
            },
          ],
        });
      if (href.includes("/api/user/wallet"))
        return Response.json({
          walletAddress: "0x1111111111111111111111111111111111111111",
        });
      if (href.includes("/api/chains"))
        return Response.json([
          {
            chainId: 8453,
            name: "Base",
            chainType: "evm",
            isTestnet: false,
            isEnabled: true,
          },
        ]);
      if (href === "https://rpc.example.com") {
        const request = JSON.parse(
          typeof init?.body === "string" ? init.body : "{}",
        ) as { method: string };
        rpcMethods.push(request.method);
        const values: Readonly<Record<string, string>> = {
          eth_chainId: "0x2105",
          eth_blockNumber: "0x10",
          eth_getBalance: "0xde0b6b3a7640000",
          eth_call: "0xf4240",
          eth_getCode: "0x60006000",
        };
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: values[request.method],
        });
      }
      if (href.includes("subgraph.autonolas.tech"))
        return Response.json({
          data: {
            _meta: { block: { number: 20 } },
            meches: [
              {
                address: "0x2222222222222222222222222222222222222222",
                mechFactory: "0x2E008211f34b25A7d7c102403c6C2C3B665a1abe",
                totalDeliveriesTransactions: "4",
              },
              {
                address: "0x3333333333333333333333333333333333333333",
                mechFactory: "0x7beD01f8482fF686F025628e7780ca6C1f0559fc",
                totalDeliveriesTransactions: "7",
              },
            ],
          },
        });
      if (href.includes("gateway.example.com"))
        return new Response("olas metadata");
      if (href.includes("hooks.example.com")) {
        expect(
          JSON.parse(typeof init?.body === "string" ? init.body : "{}"),
        ).toMatchObject({
          chainWrite: false,
        });
        expect(
          (init?.headers as Record<string, string>)["x-synesis-signature"],
        ).toMatch(/^sha256=/u);
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 404 });
    });
    const encryption = new EnvelopeEncryption(
      randomBytes(32).toString("base64"),
    );
    const service = new IntegrationService({
      store,
      encryption,
      fetch: fetcher,
      now: () => new Date("2026-09-14T12:00:00.000Z"),
      deploymentHealth: () =>
        Promise.resolve({
          manifestVersion: "base-test.1",
          manifestHash: `sha256:${"ab".repeat(32)}`,
          ready: true,
          checkedAt: "2026-09-14T12:00:00.000Z",
          checks: Array.from({ length: 10 }, (_, index) => ({
            component: `deployment.${index}`,
            status: "PASS" as const,
            message: "matches",
          })),
        }),
    });
    const summary = await service.configureAndCheck("org-1", {
      keeperHubApiKey: "kh_example1234",
      baseRpcUrl: "https://rpc.example.com",
      ipfsGatewayUrl: "https://gateway.example.com",
      deliveryWebhookUrl: "https://hooks.example.com/delivery",
      deliveryWebhookSecret: "a-secure-webhook-secret-with-32-chars",
    });

    expect(summary.readiness).toBe("READY");
    expect(summary.checks).toHaveLength(9);
    expect(summary.checks.every((check) => check.status === "ready")).toBe(
      true,
    );
    expect(captured.readiness).toMatchObject({ status: "READY" });
    expect(JSON.stringify(captured.secret)).not.toContain("kh_example1234");
    expect(rpcMethods).not.toContain("eth_sendRawTransaction");
  });
});
