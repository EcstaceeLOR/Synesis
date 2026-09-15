import {
  mechDirectorySchema,
  olasAdapterDirectorySchema,
  type MechDirectory,
} from "@synesis/domain";

export interface MechDirectoryReader {
  read(): Promise<MechDirectory>;
}

export class OlasMechDirectoryClient implements MechDirectoryReader {
  readonly #origin: URL;
  readonly #token: string;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #ttlMs: number;
  #cached?: { readonly expiresAt: number; readonly value: MechDirectory };

  public constructor(input: {
    readonly origin: string;
    readonly token: string;
    readonly fetch?: typeof fetch;
    readonly now?: () => number;
    readonly ttlMs?: number;
  }) {
    this.#origin = new URL(input.origin);
    this.#token = input.token;
    this.#fetch = input.fetch ?? fetch;
    this.#now = input.now ?? Date.now;
    this.#ttlMs = input.ttlMs ?? 60_000;
  }

  public async read(): Promise<MechDirectory> {
    const now = this.#now();
    if (this.#cached && this.#cached.expiresAt > now) return this.#cached.value;
    const response = await this.#fetch(
      new URL("/internal/v1/mechs", this.#origin),
      {
        headers: { authorization: `Bearer ${this.#token}` },
        signal: AbortSignal.timeout(25_000),
      },
    );
    if (!response.ok)
      throw new Error(`Olas adapter returned HTTP ${response.status}`);
    const value = olasAdapterDirectorySchema.parse(await response.json());
    this.#cached = { expiresAt: now + this.#ttlMs, value };
    return value;
  }
}

export const unavailableMechDirectory = (): MechDirectory =>
  mechDirectorySchema.parse({
    chainId: 8453,
    status: "degraded",
    source: "olas-mech-client",
    observedAt: new Date().toISOString(),
    observedVersion: "unconfigured",
    mechs: [],
  });
