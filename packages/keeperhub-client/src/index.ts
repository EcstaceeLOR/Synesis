export const KEEPERHUB_API_ORIGIN = "https://app.keeperhub.com";

export interface KeeperHubClientOptions {
  readonly apiKey: string;
  readonly apiOrigin?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

export class KeeperHubApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "KeeperHubApiError";
  }
}

export interface KeeperHubWallet {
  readonly walletAddress: `0x${string}`;
  readonly solanaAddress?: string;
}

export interface KeeperHubChain {
  readonly chainId: number;
  readonly name: string;
  readonly chainType: string;
  readonly isTestnet: boolean;
  readonly isEnabled: boolean;
  readonly status?: string;
}

export interface KeeperHubKey {
  readonly id: string;
  readonly name?: string;
  readonly keyPrefix: string;
  readonly scopes?: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const assertAddress = (value: unknown): `0x${string}` => {
  if (typeof value !== "string" || !/^0x[\da-f]{40}$/iu.test(value)) {
    throw new KeeperHubApiError(
      "KeeperHub returned an invalid wallet address",
      502,
    );
  }
  return value as `0x${string}`;
};

export class KeeperHubClient {
  readonly #apiKey: string;
  readonly #origin: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;

  public constructor(options: KeeperHubClientOptions) {
    if (!/^kh_[\w-]{8,}$/u.test(options.apiKey)) {
      throw new TypeError(
        "A KeeperHub organization key beginning with kh_ is required",
      );
    }
    const origin = new URL(options.apiOrigin ?? KEEPERHUB_API_ORIGIN);
    if (origin.protocol !== "https:" && origin.hostname !== "localhost") {
      throw new TypeError("KeeperHub API origin must use HTTPS");
    }
    this.#apiKey = options.apiKey;
    this.#origin = origin.origin;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 8_000;
  }

  async #get(path: string): Promise<unknown> {
    const response = await this.#fetch(`${this.#origin}${path}`, {
      headers: {
        authorization: `Bearer ${this.#apiKey}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok) {
      throw new KeeperHubApiError(
        response.status === 401
          ? "KeeperHub rejected this key; create a new organization key"
          : `KeeperHub returned HTTP ${response.status}`,
        response.status,
      );
    }
    return response.json();
  }

  public async listKeys(): Promise<readonly KeeperHubKey[]> {
    const payload = await this.#get("/api/keys?limit=100");
    const items =
      isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
    return items.flatMap((item) => {
      if (
        !isRecord(item) ||
        typeof item.id !== "string" ||
        typeof item.keyPrefix !== "string"
      )
        return [];
      return [
        {
          id: item.id,
          keyPrefix: item.keyPrefix,
          ...(typeof item.name === "string" ? { name: item.name } : {}),
          ...(typeof item.scope === "string"
            ? { scopes: item.scope.split(/\s+/u).filter(Boolean) }
            : isStringArray(item.scopes)
              ? { scopes: item.scopes }
              : {}),
        },
      ];
    });
  }

  public async getWallet(): Promise<KeeperHubWallet> {
    const payload = await this.#get("/api/user/wallet");
    if (!isRecord(payload))
      throw new KeeperHubApiError(
        "KeeperHub returned an invalid wallet response",
        502,
      );
    const candidate = isRecord(payload.wallet) ? payload.wallet : payload;
    const walletAddress = assertAddress(
      candidate.walletAddress ?? candidate.address,
    );
    return {
      walletAddress,
      ...(typeof candidate.solanaAddress === "string"
        ? { solanaAddress: candidate.solanaAddress }
        : {}),
    };
  }

  public async listChains(): Promise<readonly KeeperHubChain[]> {
    const payload = await this.#get("/api/chains");
    if (!Array.isArray(payload))
      throw new KeeperHubApiError(
        "KeeperHub returned an invalid chain catalog",
        502,
      );
    return payload.flatMap((chain) => {
      if (
        !isRecord(chain) ||
        typeof chain.chainId !== "number" ||
        typeof chain.name !== "string"
      )
        return [];
      return [
        {
          chainId: chain.chainId,
          name: chain.name,
          chainType:
            typeof chain.chainType === "string" ? chain.chainType : "unknown",
          isTestnet: chain.isTestnet === true,
          isEnabled: chain.isEnabled !== false,
          ...(typeof chain.status === "string" ? { status: chain.status } : {}),
        },
      ];
    });
  }
}

export * from "./safe-execution.js";
export * from "./receipt-verification.js";
