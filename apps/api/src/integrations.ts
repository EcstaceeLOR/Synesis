import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";

import {
  asEncryptedSecretReference,
  type IntegrationHealthCheckRecord,
  type SynesisStore,
} from "@synesis/database";
import { KeeperHubClient } from "@synesis/keeperhub-client";
import {
  BASE_DEPLOYMENT_MANIFEST,
  BASE_MECH_MARKETPLACE,
  OLAS_BASE_SUBGRAPH,
  verifyDeploymentHealth,
  type DeploymentHealthReport,
} from "@synesis/olas-contracts";

export const BASE_CHAIN_ID = 8453;
export const REQUIRED_HEALTH_COMPONENTS = [
  "keeperhub_credentials",
  "keeperhub_wallet",
  "base_support",
  "base_rpc",
  "wallet_balances",
  "olas_deployments",
  "mech_compatibility",
  "ipfs",
  "delivery_webhook",
] as const;
export type HealthComponent = (typeof REQUIRED_HEALTH_COMPONENTS)[number];
export type HealthStatus = "ready" | "failed" | "unconfigured";

export interface IntegrationCredentials {
  readonly keeperHubApiKey: string;
  readonly baseRpcUrl: string;
  readonly ipfsGatewayUrl: string;
  readonly deliveryWebhookUrl: string;
  readonly deliveryWebhookSecret: string;
  readonly olasSubgraphUrl?: string;
}

export interface HealthResult {
  readonly component: HealthComponent;
  readonly status: HealthStatus;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly durationMs: number;
  readonly checkedAt: string;
}

export interface IntegrationHealthSummary {
  readonly organizationId: string;
  readonly readiness: "NOT_READY" | "READY";
  readonly readyAt: string | null;
  readonly wallet: null | {
    readonly address: string;
    readonly ethBalanceWei: string;
    readonly usdcBalance: string;
    readonly blockNumber: number;
  };
  readonly checks: readonly HealthResult[];
}

export interface ExecutionCredentials {
  readonly keeperHubApiKey: string;
  readonly baseRpcUrl: string;
}

interface EncryptedValue {
  readonly ciphertext: string;
  readonly initializationVector: string;
  readonly authenticationTag: string;
}

export class EnvelopeEncryption {
  readonly #key: Buffer;

  public constructor(base64Key: string) {
    const key = Buffer.from(base64Key, "base64");
    if (key.length !== 32) {
      throw new TypeError(
        "SYNESIS_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
      );
    }
    this.#key = key;
  }

  public encrypt(value: string, context: string): EncryptedValue {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      this.#key,
      initializationVector,
    );
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return {
      ciphertext: ciphertext.toString("base64"),
      initializationVector: initializationVector.toString("base64"),
      authenticationTag: cipher.getAuthTag().toString("base64"),
    };
  }

  public decrypt(value: EncryptedValue, context: string): string {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.#key,
      Buffer.from(value.initializationVector, "base64"),
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(value.authenticationTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}

interface RpcResponse {
  readonly result?: unknown;
  readonly error?: { readonly message?: string };
}

const safeUrl = (value: string, name: string): string => {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new TypeError(`${name} must use HTTPS`);
  }
  return url.toString().replace(/\/$/u, "");
};

export const validateIntegrationCredentials = (
  input: IntegrationCredentials,
): IntegrationCredentials => {
  if (!/^kh_[\w-]{8,}$/u.test(input.keeperHubApiKey)) {
    throw new TypeError("Use a KeeperHub organization key beginning with kh_");
  }
  if (input.deliveryWebhookSecret.length < 32) {
    throw new TypeError(
      "Delivery webhook secret must contain at least 32 characters",
    );
  }
  return {
    keeperHubApiKey: input.keeperHubApiKey,
    baseRpcUrl: safeUrl(input.baseRpcUrl, "Base RPC URL"),
    ipfsGatewayUrl: safeUrl(input.ipfsGatewayUrl, "IPFS gateway URL"),
    deliveryWebhookUrl: safeUrl(
      input.deliveryWebhookUrl,
      "Delivery webhook URL",
    ),
    deliveryWebhookSecret: input.deliveryWebhookSecret,
    ...(input.olasSubgraphUrl
      ? { olasSubgraphUrl: safeUrl(input.olasSubgraphUrl, "Olas subgraph URL") }
      : {}),
  };
};

export interface IntegrationServiceOptions {
  readonly store: SynesisStore;
  readonly encryption: EnvelopeEncryption;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => Date;
  readonly keeperHubOrigin?: string;
  readonly ipfsProbeCid?: string;
  readonly deploymentHealth?: (
    rpcUrl: string,
  ) => Promise<DeploymentHealthReport>;
}

const formatFailure = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : "The upstream service returned an unknown error";

export class IntegrationService {
  readonly #store: SynesisStore;
  readonly #encryption: EnvelopeEncryption;
  readonly #fetch: typeof globalThis.fetch;
  readonly #now: () => Date;
  readonly #keeperHubOrigin: string | undefined;
  readonly #ipfsProbeCid: string;
  readonly #deploymentHealth: (
    rpcUrl: string,
  ) => Promise<DeploymentHealthReport>;

  public constructor(options: IntegrationServiceOptions) {
    this.#store = options.store;
    this.#encryption = options.encryption;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? (() => new Date());
    this.#keeperHubOrigin = options.keeperHubOrigin;
    this.#ipfsProbeCid =
      options.ipfsProbeCid ??
      "bafybeiatwwblrphl6qmxfqzu7ose37drqlbkboqbisldwks772yif3buky";
    this.#deploymentHealth =
      options.deploymentHealth ??
      ((rpcUrl) =>
        verifyDeploymentHealth({
          rpcUrl,
          manifest: BASE_DEPLOYMENT_MANIFEST,
          fetch: this.#fetch,
          now: () => this.#now().getTime(),
        }));
  }

  public async configureAndCheck(
    organizationId: string,
    input: IntegrationCredentials,
  ): Promise<IntegrationHealthSummary> {
    const credentials = validateIntegrationCredentials(input);
    const secretId = randomUUID();
    const encrypted = this.#encryption.encrypt(
      JSON.stringify(credentials),
      `${organizationId}:onboarding`,
    );
    await this.#store.transaction(async (repositories) => {
      await repositories.integrationSecrets.upsert({
        id: secretId,
        organizationId,
        integrationType: "onboarding",
        ...encrypted,
        keyVersion: "v1",
        updatedAt: this.#now().toISOString(),
      });
      await repositories.integrationConnections.upsert({
        id: randomUUID(),
        organizationId,
        integrationType: "keeperhub",
        encryptedSecretRef: asEncryptedSecretReference(
          `vault://synesis/${secretId}`,
        ),
      });
    });
    return this.#runChecks(organizationId, credentials);
  }

  public async recheck(
    organizationId: string,
  ): Promise<IntegrationHealthSummary> {
    const stored = await this.#store.read.integrationSecrets.find(
      organizationId,
      "onboarding",
    );
    if (!stored) return this.#unconfiguredSummary(organizationId);
    const plaintext = this.#encryption.decrypt(
      stored,
      `${organizationId}:onboarding`,
    );
    return this.#runChecks(
      organizationId,
      validateIntegrationCredentials(
        JSON.parse(plaintext) as IntegrationCredentials,
      ),
    );
  }

  public async readHealth(
    organizationId: string,
  ): Promise<IntegrationHealthSummary> {
    const [organization, checks] = await Promise.all([
      this.#store.read.organizations.findById(organizationId),
      this.#store.read.integrationHealthChecks.list(organizationId),
    ]);
    if (checks.length === 0) return this.#unconfiguredSummary(organizationId);
    return {
      organizationId,
      readiness: organization?.integrationStatus ?? "NOT_READY",
      readyAt: organization?.integrationsReadyAt ?? null,
      wallet: this.#walletFromChecks(checks),
      checks: checks.map(this.#publicCheck),
    };
  }

  public async loadExecutionCredentials(
    organizationId: string,
  ): Promise<ExecutionCredentials> {
    const [organization, stored] = await Promise.all([
      this.#store.read.organizations.findById(organizationId),
      this.#store.read.integrationSecrets.find(organizationId, "onboarding"),
    ]);
    if (organization?.integrationStatus !== "READY" || !stored) {
      throw new Error(
        "Organization integrations are not ready for value movement",
      );
    }
    const plaintext = this.#encryption.decrypt(
      stored,
      `${organizationId}:onboarding`,
    );
    const credentials = validateIntegrationCredentials(
      JSON.parse(plaintext) as IntegrationCredentials,
    );
    return {
      keeperHubApiKey: credentials.keeperHubApiKey,
      baseRpcUrl: credentials.baseRpcUrl,
    };
  }

  async #rpc(
    url: string,
    method: string,
    params: readonly unknown[],
  ): Promise<unknown> {
    const response = await this.#fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}`);
    const payload = (await response.json()) as RpcResponse;
    if (payload.error)
      throw new Error(payload.error.message ?? "RPC request failed");
    return payload.result;
  }

  async #runChecks(
    organizationId: string,
    credentials: IntegrationCredentials,
  ): Promise<IntegrationHealthSummary> {
    const started = Date.now();
    const checkedAt = this.#now().toISOString();
    const result = (
      component: HealthComponent,
      status: HealthStatus,
      message: string,
      details: Readonly<Record<string, unknown>> = {},
    ): HealthResult => ({
      component,
      status,
      message,
      details,
      durationMs: Math.max(0, Date.now() - started),
      checkedAt,
    });
    const checks: HealthResult[] = [];
    let walletAddress: `0x${string}` | undefined;
    let ethBalanceWei: string | undefined;
    let usdcBalance: string | undefined;
    let blockNumber: number | undefined;

    const keeperHub = new KeeperHubClient({
      apiKey: credentials.keeperHubApiKey,
      fetch: this.#fetch,
      ...(this.#keeperHubOrigin ? { apiOrigin: this.#keeperHubOrigin } : {}),
    });
    try {
      const keys = await keeperHub.listKeys();
      const heldKey = keys.find((key) =>
        credentials.keeperHubApiKey.startsWith(key.keyPrefix),
      );
      if (!heldKey) {
        throw new Error(
          "KeeperHub accepted the key but did not return its prefix; create a new organization key",
        );
      }
      if (
        heldKey.scopes?.length &&
        !heldKey.scopes.includes("mcp:write") &&
        !heldKey.scopes.includes("mcp:admin")
      ) {
        throw new Error(
          "KeeperHub key is read-only; create one with mcp:write or mcp:admin",
        );
      }
      checks.push(
        result(
          "keeperhub_credentials",
          "ready",
          "KeeperHub accepted this organization key.",
          {
            keyPrefix: heldKey.keyPrefix,
            scopes: heldKey.scopes ?? "unrestricted",
          },
        ),
      );
    } catch (error) {
      checks.push(
        result("keeperhub_credentials", "failed", formatFailure(error)),
      );
    }
    try {
      const wallet = await keeperHub.getWallet();
      walletAddress = wallet.walletAddress;
      checks.push(
        result(
          "keeperhub_wallet",
          "ready",
          "KeeperHub organization signer verified.",
          { walletAddress },
        ),
      );
    } catch (error) {
      checks.push(result("keeperhub_wallet", "failed", formatFailure(error)));
    }
    try {
      const chains = await keeperHub.listChains();
      const base = chains.find((chain) => chain.chainId === BASE_CHAIN_ID);
      if (!base?.isEnabled || base.isTestnet)
        throw new Error(
          "Base mainnet is not enabled for this KeeperHub organization",
        );
      checks.push(
        result(
          "base_support",
          "ready",
          "KeeperHub reports Base mainnet as enabled.",
          { chainId: BASE_CHAIN_ID, status: base.status ?? "enabled" },
        ),
      );
    } catch (error) {
      checks.push(result("base_support", "failed", formatFailure(error)));
    }

    try {
      const chainId = await this.#rpc(
        credentials.baseRpcUrl,
        "eth_chainId",
        [],
      );
      if (chainId !== "0x2105")
        throw new Error(
          `RPC is on chain ${String(chainId)}, expected Base mainnet (0x2105)`,
        );
      const block = await this.#rpc(
        credentials.baseRpcUrl,
        "eth_blockNumber",
        [],
      );
      if (typeof block !== "string")
        throw new Error("RPC returned an invalid block number");
      blockNumber = Number.parseInt(block, 16);
      checks.push(
        result("base_rpc", "ready", "RPC is synchronized with Base mainnet.", {
          chainId: BASE_CHAIN_ID,
          blockNumber,
        }),
      );
    } catch (error) {
      checks.push(result("base_rpc", "failed", formatFailure(error)));
    }

    if (walletAddress && blockNumber !== undefined) {
      try {
        const [eth, token] = await Promise.all([
          this.#rpc(credentials.baseRpcUrl, "eth_getBalance", [
            walletAddress,
            "latest",
          ]),
          this.#rpc(credentials.baseRpcUrl, "eth_call", [
            {
              to: BASE_MECH_MARKETPLACE.contracts.usdc,
              data: `0x70a08231000000000000000000000000${walletAddress.slice(2).toLowerCase()}`,
            },
            "latest",
          ]),
        ]);
        if (typeof eth !== "string" || typeof token !== "string")
          throw new Error("RPC returned invalid balance data");
        ethBalanceWei = BigInt(eth).toString();
        usdcBalance = BigInt(token).toString();
        checks.push(
          result(
            "wallet_balances",
            "ready",
            "ETH and USDC balances read without moving funds.",
            { walletAddress, ethBalanceWei, usdcBalance, blockNumber },
          ),
        );
      } catch (error) {
        checks.push(result("wallet_balances", "failed", formatFailure(error)));
      }
    } else {
      checks.push(
        result(
          "wallet_balances",
          "failed",
          "Verify the KeeperHub wallet and Base RPC before reading balances.",
        ),
      );
    }

    try {
      const deploymentHealth = await this.#deploymentHealth(
        credentials.baseRpcUrl,
      );
      if (!deploymentHealth.ready) {
        const failed = deploymentHealth.checks
          .filter((entry) => entry.status === "FAIL")
          .map((entry) => entry.component)
          .join(", ");
        throw new Error(`Pinned Base deployment mismatch: ${failed}`);
      }
      checks.push(
        result(
          "olas_deployments",
          "ready",
          "Pinned Olas, USDC, and Aave proxy deployments match live Base bytecode.",
          {
            manifestVersion: deploymentHealth.manifestVersion,
            manifestHash: deploymentHealth.manifestHash,
            verifiedChecks: deploymentHealth.checks.length,
          },
        ),
      );
    } catch (error) {
      checks.push(result("olas_deployments", "failed", formatFailure(error)));
    }

    try {
      const subgraphUrl = credentials.olasSubgraphUrl ?? OLAS_BASE_SUBGRAPH;
      const response = await this.#fetch(subgraphUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query:
            "{ _meta { block { number } } meches(first: 20, orderBy: totalDeliveriesTransactions, orderDirection: desc) { address mechFactory totalDeliveriesTransactions } }",
        }),
        signal: AbortSignal.timeout(8_000),
      });
      const payload = (await response.json()) as {
        data?: {
          _meta?: { block?: { number?: number } };
          meches?: readonly {
            address?: string;
            mechFactory?: string;
            totalDeliveriesTransactions?: string;
          }[];
        };
        errors?: unknown;
      };
      const indexedBlock = payload.data?._meta?.block?.number;
      if (!response.ok || !indexedBlock || payload.errors)
        throw new Error(
          "Olas Base subgraph is unavailable or returned GraphQL errors",
        );
      const supportedFactories = new Set(
        [
          BASE_MECH_MARKETPLACE.contracts.fixedPriceNativeFactory,
          BASE_MECH_MARKETPLACE.contracts.fixedPriceTokenFactory,
          BASE_MECH_MARKETPLACE.contracts.nvmNativeFactory,
          BASE_MECH_MARKETPLACE.contracts.nvmUsdcFactory,
        ].map((address) => address?.toLowerCase()),
      );
      const compatible = (payload.data?.meches ?? []).filter(
        (mech) =>
          typeof mech.address === "string" &&
          typeof mech.mechFactory === "string" &&
          supportedFactories.has(mech.mechFactory.toLowerCase()) &&
          Number(mech.totalDeliveriesTransactions ?? 0) > 0,
      );
      if (compatible.length < 2) {
        throw new Error(
          `Only ${compatible.length} proven compatible Base Mech(s) found; Synesis requires two`,
        );
      }
      checks.push(
        result(
          "mech_compatibility",
          "ready",
          `${compatible.length} live Base Mechs use official payment factories and have deliveries.`,
          {
            indexedBlock,
            paymentAsset: "USDC",
            compatibleMechs: compatible.map((mech) => mech.address),
          },
        ),
      );
    } catch (error) {
      checks.push(result("mech_compatibility", "failed", formatFailure(error)));
    }

    try {
      const response = await this.#fetch(
        `${credentials.ipfsGatewayUrl}/ipfs/${this.#ipfsProbeCid}`,
        {
          headers: { range: "bytes=0-63" },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!response.ok)
        throw new Error(`IPFS gateway returned HTTP ${response.status}`);
      checks.push(
        result(
          "ipfs",
          "ready",
          "IPFS gateway resolved immutable Olas content.",
          { cid: this.#ipfsProbeCid },
        ),
      );
    } catch (error) {
      checks.push(result("ipfs", "failed", formatFailure(error)));
    }

    try {
      const probeId = randomUUID();
      const payload = JSON.stringify({
        type: "synesis.integration.probe",
        probeId,
        sentAt: checkedAt,
        chainWrite: false,
      });
      const signature = createHmac("sha256", credentials.deliveryWebhookSecret)
        .update(payload)
        .digest("hex");
      const response = await this.#fetch(credentials.deliveryWebhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-synesis-event": "integration.probe",
          "x-synesis-signature": `sha256=${signature}`,
        },
        body: payload,
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok)
        throw new Error(`Delivery webhook returned HTTP ${response.status}`);
      checks.push(
        result(
          "delivery_webhook",
          "ready",
          "Signed delivery probe acknowledged; no chain write was made.",
          { probeId, chainWrite: false },
        ),
      );
    } catch (error) {
      checks.push(result("delivery_webhook", "failed", formatFailure(error)));
    }

    const readiness = REQUIRED_HEALTH_COMPONENTS.every(
      (component) =>
        checks.find((check) => check.component === component)?.status ===
        "ready",
    )
      ? "READY"
      : "NOT_READY";
    const readyAt = readiness === "READY" ? checkedAt : null;
    await this.#store.transaction(async (repositories) => {
      for (const check of checks) {
        await repositories.integrationHealthChecks.upsert({
          id: randomUUID(),
          organizationId,
          ...check,
        });
      }
      if (
        walletAddress &&
        ethBalanceWei &&
        usdcBalance &&
        blockNumber !== undefined
      ) {
        await repositories.walletSnapshots.create({
          id: randomUUID(),
          organizationId,
          walletAddress,
          chainId: BASE_CHAIN_ID,
          ethBalance: ethBalanceWei,
          usdcBalance,
          blockNumber,
          capturedAt: checkedAt,
        });
      }
      await repositories.organizations.setIntegrationReadiness({
        id: organizationId,
        status: readiness,
        readyAt,
      });
    });
    return {
      organizationId,
      readiness,
      readyAt,
      wallet:
        walletAddress &&
        ethBalanceWei &&
        usdcBalance &&
        blockNumber !== undefined
          ? { address: walletAddress, ethBalanceWei, usdcBalance, blockNumber }
          : null,
      checks,
    };
  }

  #unconfiguredSummary(organizationId: string): IntegrationHealthSummary {
    const checkedAt = this.#now().toISOString();
    const checks = REQUIRED_HEALTH_COMPONENTS.map(
      (component): HealthResult => ({
        component,
        status: "unconfigured",
        message: "Add integration settings, then run verification.",
        details: {},
        durationMs: 0,
        checkedAt,
      }),
    );
    return {
      organizationId,
      readiness: "NOT_READY",
      readyAt: null,
      wallet: null,
      checks,
    };
  }

  #walletFromChecks(
    checks: readonly IntegrationHealthCheckRecord[],
  ): IntegrationHealthSummary["wallet"] {
    const details = checks.find(
      (check) => check.component === "wallet_balances",
    )?.details;
    if (!details || typeof details !== "object" || Array.isArray(details))
      return null;
    const value = details as Record<string, unknown>;
    return typeof value.walletAddress === "string" &&
      typeof value.ethBalanceWei === "string" &&
      typeof value.usdcBalance === "string" &&
      typeof value.blockNumber === "number"
      ? {
          address: value.walletAddress,
          ethBalanceWei: value.ethBalanceWei,
          usdcBalance: value.usdcBalance,
          blockNumber: value.blockNumber,
        }
      : null;
  }

  #publicCheck(check: IntegrationHealthCheckRecord): HealthResult {
    return {
      component: check.component as HealthComponent,
      status: check.status,
      message: check.message,
      details: check.details as Readonly<Record<string, unknown>>,
      durationMs: check.durationMs,
      checkedAt: check.checkedAt,
    };
  }
}
