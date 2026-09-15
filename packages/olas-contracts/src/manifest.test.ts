import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";

import { encodeAllowedCall, validateCalldata } from "./calldata.js";
import { assertDeploymentHealth, verifyDeploymentHealth } from "./health.js";
import {
  BASE_DEPLOYMENT_MANIFEST,
  BASE_DEPLOYMENT_MANIFEST_UPDATE_AUDIT_EVENT,
  BASE_DEPLOYMENT_MANIFEST_V1,
  DeploymentManifestError,
  assertManifestReference,
  createManifestUpdate,
  createVersionedManifest,
  referenceManifest,
  selectorForSignature,
  type Address,
} from "./manifest.js";

const contract = (
  id: "OLAS_MARKETPLACE" | "OLAS_USDC_BALANCE_TRACKER" | "USDC" | "AAVE_POOL",
) => {
  const match = BASE_DEPLOYMENT_MANIFEST.contracts.find(
    (entry) => entry.id === id,
  );
  if (!match) throw new Error(`Missing ${id}`);
  return match;
};

const wallet = `0x${"11".repeat(20)}` as const;
const mech = `0x${"22".repeat(20)}` as const;
const unknownTarget: Address = `0x${"ff".repeat(20)}`;
const paymentType =
  "0x6406bb5f31a732f898e1ce9fdd988a80a808d36ab5d9a4a4805a8be8d197d5e3" as const;

describe("versioned Base deployment manifest", () => {
  it("pins exact official selectors and immutable content", () => {
    expect(BASE_DEPLOYMENT_MANIFEST_V1.contentHash).toBe(
      "sha256:e585859ea3792a6838e99aa6eb4047f017001bac4b983b12717d791b1fc6f927",
    );
    expect(BASE_DEPLOYMENT_MANIFEST.manifestVersion).toBe("base-2026-09-15.2");
    expect(BASE_DEPLOYMENT_MANIFEST_UPDATE_AUDIT_EVENT).toMatchObject({
      action: "deployment_manifest.version_created",
      previousManifestHash: BASE_DEPLOYMENT_MANIFEST_V1.contentHash,
      nextManifestHash: BASE_DEPLOYMENT_MANIFEST.contentHash,
    });
    expect(
      selectorForSignature(
        "request(bytes,uint256,bytes32,address,uint256,bytes)",
      ),
    ).toBe("0xf6938b09");
    expect(selectorForSignature("approve(address,uint256)")).toBe("0x095ea7b3");
    expect(selectorForSignature("supply(address,uint256,address,uint16)")).toBe(
      "0x617ba037",
    );
    expect(BASE_DEPLOYMENT_MANIFEST.contentHash).toMatch(
      /^sha256:[\da-f]{64}$/u,
    );
    expect(Object.isFrozen(BASE_DEPLOYMENT_MANIFEST)).toBe(true);
    expect(Object.isFrozen(BASE_DEPLOYMENT_MANIFEST.allowedCalls)).toBe(true);
    const reference = referenceManifest(BASE_DEPLOYMENT_MANIFEST);
    expect(() =>
      assertManifestReference(BASE_DEPLOYMENT_MANIFEST, reference),
    ).not.toThrow();
    expect(() =>
      assertManifestReference(BASE_DEPLOYMENT_MANIFEST, {
        ...reference,
        contentHash: `sha256:${"00".repeat(32)}`,
      }),
    ).toThrow("does not match immutable content");
  });

  it("requires a new version and produces an audit event for updates", () => {
    const { contentHash: _contentHash, ...content } = BASE_DEPLOYMENT_MANIFEST;
    void _contentHash;
    expect(() =>
      createManifestUpdate({
        previous: BASE_DEPLOYMENT_MANIFEST,
        next: content,
        actorId: "operator-1",
        reason: "Aave upgrade",
        occurredAt: "2026-09-15T01:00:00.000Z",
      }),
    ).toThrow("new manifest version");

    const result = createManifestUpdate({
      previous: BASE_DEPLOYMENT_MANIFEST,
      next: { ...content, manifestVersion: "base-2026-09-15.3" },
      actorId: "operator-1",
      reason: "Aave upgrade",
      occurredAt: "2026-09-15T01:00:00.000Z",
    });
    expect(result.auditEvent).toMatchObject({
      action: "deployment_manifest.version_created",
      previousManifestHash: BASE_DEPLOYMENT_MANIFEST.contentHash,
      nextManifestHash: result.manifest.contentHash,
    });
  });

  it("rejects ambiguous target-selector ABI entries", () => {
    const { contentHash: _contentHash, ...content } = BASE_DEPLOYMENT_MANIFEST;
    void _contentHash;
    const duplicate = content.allowedCalls[0];
    if (!duplicate) throw new Error("Missing call");
    expect(() =>
      createVersionedManifest({
        ...content,
        allowedCalls: [...content.allowedCalls, duplicate],
      }),
    ).toThrow("Ambiguous target and selector pair");
  });
});

describe("exact calldata allowlist", () => {
  it("decodes canonical Olas USDC requests with discovered Mech approval", () => {
    const data = encodeAllowedCall({
      callId: "OLAS_REQUEST",
      requestData: "0x1234",
      maxDeliveryRate: "900000",
      paymentType,
      priorityMech: mech,
      responseTimeout: 120,
      paymentData: "0x",
    });
    expect(
      validateCalldata({
        chainId: 8453,
        target: contract("OLAS_MARKETPLACE").address,
        data,
        nativeValueWei: "0",
        allowedPriorityMechs: [mech],
      }),
    ).toMatchObject({
      callId: "OLAS_REQUEST",
      arguments: { priorityMech: mech, maxDeliveryRate: "900000" },
    });
    expect(() =>
      validateCalldata({
        chainId: 8453,
        target: contract("OLAS_MARKETPLACE").address,
        data,
        nativeValueWei: "0",
        allowedPriorityMechs: [],
      }),
    ).toThrow("not approved by compatibility discovery");
  });

  it("allows only bounded Aave approvals and wallet-bound USDC supply", () => {
    const approve = encodeAllowedCall({
      callId: "USDC_APPROVE",
      spender: contract("AAVE_POOL").address,
      amount: "1000000",
    });
    expect(
      validateCalldata({
        chainId: 8453,
        target: contract("USDC").address,
        data: approve,
        nativeValueWei: "0",
      }).callId,
    ).toBe("USDC_APPROVE");

    const olasApprove = encodeAllowedCall({
      callId: "USDC_APPROVE",
      spender: contract("OLAS_USDC_BALANCE_TRACKER").address,
      amount: "1000000",
    });
    expect(
      validateCalldata({
        chainId: 8453,
        target: contract("USDC").address,
        data: olasApprove,
        nativeValueWei: "0",
      }),
    ).toMatchObject({
      arguments: {
        spender: contract("OLAS_USDC_BALANCE_TRACKER").address,
        amount: "1000000",
      },
    });

    const supply = encodeAllowedCall({
      callId: "AAVE_SUPPLY",
      asset: contract("USDC").address,
      amount: "1000000",
      onBehalfOf: wallet,
      referralCode: 0,
    });
    expect(
      validateCalldata({
        chainId: 8453,
        target: contract("AAVE_POOL").address,
        data: supply,
        nativeValueWei: "0",
        expectedWallet: wallet,
      }),
    ).toMatchObject({
      callId: "AAVE_SUPPLY",
      arguments: { asset: contract("USDC").address, onBehalfOf: wallet },
    });
    expect(() =>
      validateCalldata({
        chainId: 8453,
        target: contract("AAVE_POOL").address,
        data: supply,
        nativeValueWei: "0",
        expectedWallet: mech,
      }),
    ).toThrow("beneficiary does not match");
  });

  it.each([
    ["chain", { chainId: 1 }],
    ["target", { target: unknownTarget }],
    ["selector", { data: "0xdeadbeef" as const }],
    ["value", { nativeValueWei: "1" }],
  ])("fails closed for an unknown %s", (_label, override) => {
    const data = encodeAllowedCall({
      callId: "USDC_APPROVE",
      spender: contract("AAVE_POOL").address,
      amount: "1000000",
    });
    expect(() =>
      validateCalldata({
        chainId: 8453,
        target: contract("USDC").address,
        data,
        nativeValueWei: "0",
        ...override,
      }),
    ).toThrow(DeploymentManifestError);
  });

  it("rejects excessive amounts and non-canonical trailing calldata", () => {
    const excessive = encodeAllowedCall({
      callId: "USDC_APPROVE",
      spender: contract("AAVE_POOL").address,
      amount: "10000000001",
    });
    expect(() =>
      validateCalldata({
        chainId: 8453,
        target: contract("USDC").address,
        data: excessive,
        nativeValueWei: "0",
      }),
    ).toThrow("exceeds the manifest cap");
    expect(() =>
      validateCalldata({
        chainId: 8453,
        target: contract("USDC").address,
        data: `${excessive}00`,
        nativeValueWei: "0",
      }),
    ).toThrow("non-canonical length");
  });
});

const codeHash = (code: string): string =>
  `sha256:${bytesToHex(sha256(hexToBytes(code.slice(2))))}`;

const healthManifest = (): {
  readonly manifest: ReturnType<typeof createVersionedManifest>;
  readonly code: Readonly<Record<string, string>>;
} => {
  const codes = [
    "0x60",
    "0x6001",
    "0x6002",
    "0x6003",
    "0x6004",
    "0x6005",
    "0x6006",
  ];
  const code: Record<string, string> = {};
  const { contentHash: _contentHash, ...content } = BASE_DEPLOYMENT_MANIFEST;
  void _contentHash;
  let codeIndex = 0;
  const contracts = content.contracts.map((entry) => {
    const proxyCode = codes[codeIndex++];
    if (!proxyCode) throw new Error("Missing fixture code");
    code[entry.address] = proxyCode;
    if (entry.proxy.kind === "NONE") {
      return { ...entry, runtimeCodeSha256: codeHash(proxyCode) };
    }
    const implementationCode = codes[codeIndex++];
    if (!implementationCode) throw new Error("Missing fixture code");
    code[entry.proxy.implementation] = implementationCode;
    return {
      ...entry,
      runtimeCodeSha256: codeHash(proxyCode),
      proxy: {
        ...entry.proxy,
        implementationCodeSha256: codeHash(implementationCode),
      },
    };
  });
  return {
    manifest: createVersionedManifest({
      ...content,
      manifestVersion: "test-health.1",
      contracts,
    }),
    code,
  };
};

describe("startup deployment health", () => {
  it("verifies chain, proxy code, implementations, and implementation code", async () => {
    const fixture = healthManifest();
    const fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      if (typeof init?.body !== "string")
        throw new Error("Missing JSON-RPC body");
      const request = JSON.parse(init.body) as {
        id: number;
        method: string;
        params: readonly unknown[];
      };
      let result: unknown = "0x2105";
      if (request.method === "eth_getCode") {
        result = fixture.code[String(request.params[0])];
      } else if (request.method === "eth_call") {
        const call = request.params[0] as { to: string };
        const deployment = fixture.manifest.contracts.find(
          (entry) => entry.address === call.to,
        );
        if (!deployment || deployment.proxy.kind === "NONE")
          throw new Error("Missing proxy fixture");
        result = `0x${deployment.proxy.implementation.slice(2).padStart(64, "0")}`;
      } else if (request.method === "eth_getStorageAt") {
        const deployment = fixture.manifest.contracts.find(
          (entry) => entry.address === request.params[0],
        );
        if (!deployment || deployment.proxy.kind === "NONE")
          throw new Error("Missing proxy fixture");
        result = `0x${deployment.proxy.implementation.slice(2).padStart(64, "0")}`;
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ jsonrpc: "2.0", id: request.id, result }),
        ),
      );
    });
    const report = await assertDeploymentHealth({
      rpcUrl: "https://base-rpc.example",
      manifest: fixture.manifest,
      fetch,
      now: () => Date.parse("2026-09-15T01:00:00.000Z"),
    });
    expect(report.ready).toBe(true);
    expect(report.checks).toHaveLength(11);
  });

  it("fails closed when a proxy implementation changes", async () => {
    const fixture = healthManifest();
    const fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      if (typeof init?.body !== "string")
        throw new Error("Missing JSON-RPC body");
      const request = JSON.parse(init.body) as {
        id: number;
        method: string;
        params: readonly unknown[];
      };
      let result: unknown = "0x2105";
      if (request.method === "eth_getCode") {
        result = fixture.code[String(request.params[0])];
      } else if (
        request.method === "eth_call" ||
        request.method === "eth_getStorageAt"
      ) {
        result = `0x${"ff".repeat(20).padStart(64, "0")}`;
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ jsonrpc: "2.0", id: request.id, result }),
        ),
      );
    });
    const report = await verifyDeploymentHealth({
      rpcUrl: "https://base-rpc.example",
      manifest: fixture.manifest,
      fetch,
    });
    expect(report.ready).toBe(false);
    expect(
      report.checks.some((entry) =>
        entry.component.endsWith(".implementation"),
      ),
    ).toBe(true);
    await expect(
      assertDeploymentHealth({
        rpcUrl: "https://base-rpc.example",
        manifest: fixture.manifest,
        fetch,
      }),
    ).rejects.toThrow("failed closed");
  });
});
