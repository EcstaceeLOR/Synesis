import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import {
  BASE_DEPLOYMENT_MANIFEST,
  DeploymentManifestError,
  type Address,
  type VersionedDeploymentManifest,
} from "./manifest.js";

export interface DeploymentHealthCheck {
  readonly component: string;
  readonly status: "PASS" | "FAIL";
  readonly message: string;
  readonly observed?: string;
  readonly expected?: string;
}

export interface DeploymentHealthReport {
  readonly manifestVersion: string;
  readonly manifestHash: string;
  readonly ready: boolean;
  readonly checkedAt: string;
  readonly checks: readonly DeploymentHealthCheck[];
}

export interface DeploymentHealthOptions {
  readonly rpcUrl: string;
  readonly manifest?: VersionedDeploymentManifest;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly now?: () => number;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const hashCode = (code: string): string => {
  if (!/^0x(?:[\da-f]{2})+$/iu.test(code)) {
    throw new DeploymentManifestError(
      "RPC returned missing or malformed bytecode",
    );
  }
  return `sha256:${bytesToHex(sha256(hexToBytes(code.slice(2))))}`;
};

const addressFromWord = (word: unknown): Address => {
  if (typeof word !== "string" || !/^0x[\da-f]{64}$/iu.test(word)) {
    throw new DeploymentManifestError(
      "Proxy implementation response is malformed",
    );
  }
  return `0x${word.slice(-40).toLowerCase()}`;
};

class BaseRpcReader {
  readonly #url: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;
  #id = 0;

  public constructor(options: DeploymentHealthOptions) {
    const url = new URL(options.rpcUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      throw new TypeError("Base RPC URL must use HTTPS");
    }
    this.#url = url.toString();
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 15_000;
  }

  public async call(
    method: string,
    parameters: readonly unknown[],
  ): Promise<unknown> {
    const response = await this.#fetch(this.#url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++this.#id,
        method,
        params: parameters,
      }),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    const body: unknown = await response.json().catch(() => undefined);
    const parsed = asRecord(body);
    if (!response.ok || !parsed || parsed.error !== undefined) {
      throw new DeploymentManifestError(`Base RPC ${method} failed`);
    }
    return parsed.result;
  }
}

const check = (
  component: string,
  observed: string,
  expected: string,
): DeploymentHealthCheck => ({
  component,
  status: observed.toLowerCase() === expected.toLowerCase() ? "PASS" : "FAIL",
  message:
    observed.toLowerCase() === expected.toLowerCase()
      ? `${component} matches the pinned manifest`
      : `${component} differs from the pinned manifest`,
  observed,
  expected,
});

export const verifyDeploymentHealth = async (
  options: DeploymentHealthOptions,
): Promise<DeploymentHealthReport> => {
  const manifest = options.manifest ?? BASE_DEPLOYMENT_MANIFEST;
  const rpc = new BaseRpcReader(options);
  const checks: DeploymentHealthCheck[] = [];
  try {
    const chainId = String(await rpc.call("eth_chainId", []));
    checks.push(check("chain.id", chainId, "0x2105"));
    if (chainId.toLowerCase() !== "0x2105") {
      return {
        manifestVersion: manifest.manifestVersion,
        manifestHash: manifest.contentHash,
        ready: false,
        checkedAt: new Date((options.now ?? Date.now)()).toISOString(),
        checks,
      };
    }
    for (const contract of manifest.contracts) {
      const proxyCode = String(
        await rpc.call("eth_getCode", [contract.address, "latest"]),
      );
      let observedProxyHash = "invalid";
      try {
        observedProxyHash = hashCode(proxyCode);
      } catch {
        // The failed comparison below retains a complete health report.
      }
      checks.push(
        check(
          `${contract.id}.proxy_code`,
          observedProxyHash,
          contract.runtimeCodeSha256,
        ),
      );

      let rawImplementation: unknown;
      if (contract.proxy.kind === "CALL") {
        rawImplementation = await rpc.call("eth_call", [
          { to: contract.address, data: contract.proxy.resolver },
          "latest",
        ]);
      } else {
        rawImplementation = await rpc.call("eth_getStorageAt", [
          contract.address,
          contract.proxy.storageSlot,
          "latest",
        ]);
      }
      let observedImplementation = "invalid";
      try {
        observedImplementation = addressFromWord(rawImplementation);
      } catch {
        // The failed comparison below retains a complete health report.
      }
      checks.push(
        check(
          `${contract.id}.implementation`,
          observedImplementation,
          contract.proxy.implementation,
        ),
      );

      const implementationCode = String(
        await rpc.call("eth_getCode", [
          contract.proxy.implementation,
          "latest",
        ]),
      );
      let observedImplementationHash = "invalid";
      try {
        observedImplementationHash = hashCode(implementationCode);
      } catch {
        // The failed comparison below retains a complete health report.
      }
      checks.push(
        check(
          `${contract.id}.implementation_code`,
          observedImplementationHash,
          contract.proxy.implementationCodeSha256,
        ),
      );
    }
  } catch (error) {
    checks.push({
      component: "rpc",
      status: "FAIL",
      message:
        error instanceof Error
          ? error.message
          : "Deployment health check failed",
    });
  }
  return {
    manifestVersion: manifest.manifestVersion,
    manifestHash: manifest.contentHash,
    ready:
      checks.length > 0 && checks.every((entry) => entry.status === "PASS"),
    checkedAt: new Date((options.now ?? Date.now)()).toISOString(),
    checks,
  };
};

export const assertDeploymentHealth = async (
  options: DeploymentHealthOptions,
): Promise<DeploymentHealthReport> => {
  const report = await verifyDeploymentHealth(options);
  if (!report.ready) {
    const failures = report.checks
      .filter((entry) => entry.status === "FAIL")
      .map((entry) => entry.component)
      .join(", ");
    throw new DeploymentManifestError(
      `Deployment manifest health failed closed: ${failures || "no checks completed"}`,
    );
  }
  return report;
};
