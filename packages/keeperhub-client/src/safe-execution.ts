import { createHash } from "node:crypto";

import { keccak_256 } from "@noble/hashes/sha3.js";

import { KEEPERHUB_API_ORIGIN, type KeeperHubClientOptions } from "./index.js";

type Address = `0x${string}`;

export interface ContractCallRule {
  readonly chainId: number;
  readonly target: Address;
  readonly functionName: string;
  readonly functionSelector: `0x${string}`;
  readonly maxNativeValueWei: string;
  readonly amountArgumentIndex?: number;
  readonly maxAmountBaseUnits?: string;
  readonly tokenAddress?: Address;
  readonly tokenLocation?: "target" | number;
}

export interface ProtocolActionRule {
  readonly chainId: number;
  readonly protocol: string;
  readonly action: string;
  readonly amountField?: string;
  readonly maxAmountBaseUnits?: string;
  readonly tokenField?: string;
  readonly tokenAddress?: Address;
  readonly allowedParameterFields: readonly string[];
}

export interface SafeExecutionPolicy {
  readonly contractCalls: readonly ContractCallRule[];
  readonly protocolActions: readonly ProtocolActionRule[];
}

export interface SafeContractCall {
  readonly taskId: string;
  readonly chainId: number;
  readonly contractAddress: Address;
  readonly functionName: string;
  readonly functionSelector: `0x${string}`;
  readonly functionArgs: readonly unknown[];
  readonly abi: readonly Readonly<Record<string, unknown>>[];
  readonly value?: string;
  readonly tokenAddress?: Address;
  readonly gasLimitMultiplier?: string;
}

export interface SafeProtocolAction {
  readonly taskId: string;
  readonly chainId: number;
  readonly protocol: string;
  readonly action: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface RequestIdentity {
  readonly requestId: string;
  readonly traceId: string;
}

export interface RateLimitState {
  readonly limit?: number;
  readonly remaining?: number;
  readonly resetAt?: string;
  readonly retryAfterMs?: number;
}

export interface KeeperHubEvidence {
  readonly operation: "simulation" | "broadcast" | "protocol" | "status";
  readonly payloadHash: string;
  readonly idempotencyKey?: string;
  readonly requestId: string;
  readonly traceId: string;
  readonly rateLimit: RateLimitState;
  readonly pollAfterMs?: number;
  readonly response: Readonly<Record<string, unknown>>;
}

export interface SimulationEvidence extends KeeperHubEvidence {
  readonly operation: "simulation";
  readonly approvedForBroadcast: boolean;
}

export interface SafeExecutionLogger {
  record(event: {
    readonly operation: KeeperHubEvidence["operation"];
    readonly payloadHash: string;
    readonly requestId: string;
    readonly traceId: string;
    readonly idempotencyKey?: string;
    readonly statusCode: number;
    readonly executionId?: string;
  }): void;
}

export class SafeExecutionPolicyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SafeExecutionPolicyError";
  }
}

export class KeeperHubExecutionError extends Error {
  public constructor(
    message: string,
    status: number,
    public readonly response: Readonly<Record<string, unknown>>,
    public readonly rateLimit: RateLimitState,
  ) {
    super(message);
    this.name = "KeeperHubExecutionError";
  }
}

interface PreparedContractCall {
  readonly body: Readonly<Record<string, unknown>>;
  readonly payloadHash: string;
  readonly idempotencyKey: string;
}

interface PreparedProtocolAction extends PreparedContractCall {
  readonly path: string;
}

export interface SafeExecutionClientOptions extends KeeperHubClientOptions {
  readonly policy: SafeExecutionPolicy;
  readonly logger?: SafeExecutionLogger;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly maxRateLimitRetries?: number;
}

const addressPattern = /^0x[\da-f]{40}$/iu;
const selectorPattern = /^0x[\da-f]{8}$/iu;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const decimalPattern = /^\d+(?:\.\d+)?$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeAddress = (value: string, label: string): Address => {
  if (!addressPattern.test(value)) {
    throw new SafeExecutionPolicyError(
      `${label} must be a 20-byte EVM address`,
    );
  }
  return value.toLowerCase() as Address;
};

const normalizeInteger = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "bigint"
  ) {
    throw new SafeExecutionPolicyError(`${label} must be an unsigned integer`);
  }
  const text = String(value).trim();
  if (!/^\d+$/u.test(text))
    throw new SafeExecutionPolicyError(`${label} must be an unsigned integer`);
  return BigInt(text).toString();
};

export const canonicalDecimal = (value: string): string => {
  const text = value.trim();
  if (!decimalPattern.test(text)) {
    throw new SafeExecutionPolicyError(
      "Native value must be a plain non-negative decimal string",
    );
  }
  const [whole = "0", fraction = ""] = text.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/u, "");
  const normalizedFraction = fraction.replace(/0+$/u, "");
  return normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
};

const decimalToUnits = (value: string, decimals: number): bigint => {
  const canonical = canonicalDecimal(value);
  const [whole = "0", fraction = ""] = canonical.split(".");
  if (fraction.length > decimals) {
    throw new SafeExecutionPolicyError(
      `Native value exceeds ${decimals} decimal places`,
    );
  }
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0")
  );
};

export const canonicalJson = (value: unknown): string => {
  const visit = (candidate: unknown): unknown => {
    if (
      candidate === null ||
      typeof candidate === "string" ||
      typeof candidate === "boolean"
    )
      return candidate;
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate))
        throw new SafeExecutionPolicyError("Payload numbers must be finite");
      return candidate;
    }
    if (typeof candidate === "bigint") return candidate.toString();
    if (Array.isArray(candidate)) return candidate.map(visit);
    if (isRecord(candidate)) {
      return Object.fromEntries(
        Object.keys(candidate)
          .sort()
          .map((key) => [key, visit(candidate[key])]),
      );
    }
    throw new SafeExecutionPolicyError("Payload contains a non-JSON value");
  };
  return JSON.stringify(visit(value));
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const escapeTaskId = (value: string): string => {
  const taskId = value.trim();
  if (!taskId)
    throw new SafeExecutionPolicyError("A stable taskId is required");
  return taskId.replaceAll("%", "%25").replaceAll("|", "%7C");
};

const requireChainId = (chainId: number): number => {
  if (!Number.isSafeInteger(chainId) || chainId < 1) {
    throw new SafeExecutionPolicyError(
      "chainId must be a positive decimal integer",
    );
  }
  return chainId;
};

const solidityType = (input: unknown): string => {
  if (!isRecord(input) || typeof input.type !== "string") {
    throw new SafeExecutionPolicyError(
      "ABI function inputs must declare Solidity types",
    );
  }
  if (!input.type.startsWith("tuple")) return input.type;
  if (!Array.isArray(input.components)) {
    throw new SafeExecutionPolicyError(
      "ABI tuple inputs must declare components",
    );
  }
  const suffix = input.type.slice("tuple".length);
  return `(${input.components.map(solidityType).join(",")})${suffix}`;
};

export const selectorFromAbi = (
  entry: Readonly<Record<string, unknown>>,
): `0x${string}` => {
  if (
    entry.type !== "function" ||
    typeof entry.name !== "string" ||
    !Array.isArray(entry.inputs)
  ) {
    throw new SafeExecutionPolicyError("ABI entry must be a named function");
  }
  const signature = `${entry.name}(${entry.inputs.map(solidityType).join(",")})`;
  const digest = keccak_256(new TextEncoder().encode(signature));
  return `0x${Buffer.from(digest.subarray(0, 4)).toString("hex")}`;
};

const validateAbi = (
  abi: readonly Readonly<Record<string, unknown>>[],
  functionName: string,
  selector: string,
): void => {
  const match = abi.find(
    (entry) =>
      entry.type === "function" &&
      entry.name === functionName &&
      selectorFromAbi(entry) === selector,
  );
  if (!match) {
    throw new SafeExecutionPolicyError(
      `ABI does not bind ${functionName} to allowlisted selector ${selector}`,
    );
  }
  if (match.stateMutability === "view" || match.stateMutability === "pure") {
    throw new SafeExecutionPolicyError(
      "Safe-execution gateway accepts write functions only",
    );
  }
};

export const prepareContractCall = (
  call: SafeContractCall,
  policy: SafeExecutionPolicy,
): PreparedContractCall => {
  const chainId = requireChainId(call.chainId);
  const target = normalizeAddress(call.contractAddress, "Contract target");
  const functionName = call.functionName.trim();
  const selector = call.functionSelector.toLowerCase();
  if (!selectorPattern.test(selector)) {
    throw new SafeExecutionPolicyError(
      "functionSelector must contain exactly four bytes",
    );
  }
  const rule = policy.contractCalls.find(
    (candidate) =>
      candidate.chainId === chainId &&
      normalizeAddress(candidate.target, "Policy target") === target &&
      candidate.functionName === functionName &&
      candidate.functionSelector.toLowerCase() === selector,
  );
  if (!rule) {
    throw new SafeExecutionPolicyError(
      "Chain, target, function, or selector is not allowlisted",
    );
  }
  validateAbi(call.abi, functionName, selector);
  const value = canonicalDecimal(call.value ?? "0");
  if (
    decimalToUnits(value, 18) >
    BigInt(normalizeInteger(rule.maxNativeValueWei, "Native value cap"))
  ) {
    throw new SafeExecutionPolicyError(
      "Native value exceeds the allowlisted cap",
    );
  }
  if (rule.amountArgumentIndex !== undefined) {
    const amount = normalizeInteger(
      call.functionArgs[rule.amountArgumentIndex],
      "Token amount argument",
    );
    if (
      !rule.maxAmountBaseUnits ||
      BigInt(amount) >
        BigInt(normalizeInteger(rule.maxAmountBaseUnits, "Token amount cap"))
    ) {
      throw new SafeExecutionPolicyError(
        "Token amount exceeds the allowlisted cap",
      );
    }
  }
  if (rule.tokenAddress) {
    const expected = normalizeAddress(rule.tokenAddress, "Policy token");
    const supplied = call.tokenAddress
      ? normalizeAddress(call.tokenAddress, "Token")
      : undefined;
    if (supplied !== expected)
      throw new SafeExecutionPolicyError(
        "Token is not allowlisted for this call",
      );
    const located =
      rule.tokenLocation === "target"
        ? target
        : typeof rule.tokenLocation === "number" &&
            typeof call.functionArgs[rule.tokenLocation] === "string"
          ? normalizeAddress(
              call.functionArgs[rule.tokenLocation] as string,
              "Token argument",
            )
          : undefined;
    if (located !== expected)
      throw new SafeExecutionPolicyError(
        "Token does not match the allowlisted payload location",
      );
  }
  const body: Record<string, unknown> = {
    contractAddress: target,
    chainId,
    functionName,
    functionArgs: canonicalJson(call.functionArgs),
    abi: canonicalJson(call.abi),
  };
  if (value !== "0") body.value = value;
  if (call.gasLimitMultiplier !== undefined)
    body.gasLimitMultiplier = canonicalDecimal(call.gasLimitMultiplier);
  const payloadHash = `sha256:${sha256(canonicalJson(body))}`;
  const idempotencyMaterial = [
    escapeTaskId(call.taskId),
    String(chainId),
    target,
    selector,
    sha256(body.functionArgs as string),
    value,
    call.tokenAddress ? normalizeAddress(call.tokenAddress, "Token") : "",
  ].join("|");
  return { body, payloadHash, idempotencyKey: sha256(idempotencyMaterial) };
};

export const prepareProtocolAction = (
  action: SafeProtocolAction,
  policy: SafeExecutionPolicy,
): PreparedProtocolAction => {
  const chainId = requireChainId(action.chainId);
  const protocol = action.protocol.trim();
  const actionSlug = action.action.trim();
  if (!slugPattern.test(protocol) || !slugPattern.test(actionSlug)) {
    throw new SafeExecutionPolicyError(
      "Protocol and action must be lowercase URL slugs",
    );
  }
  const rule = policy.protocolActions.find(
    (candidate) =>
      candidate.chainId === chainId &&
      candidate.protocol === protocol &&
      candidate.action === actionSlug,
  );
  if (!rule)
    throw new SafeExecutionPolicyError("Protocol action is not allowlisted");
  const unknownFields = Object.keys(action.parameters).filter(
    (field) =>
      field !== "chainId" && !rule.allowedParameterFields.includes(field),
  );
  if (unknownFields.length > 0) {
    throw new SafeExecutionPolicyError(
      `Protocol parameters are not allowlisted: ${unknownFields.join(", ")}`,
    );
  }
  if (rule.amountField) {
    const amount = normalizeInteger(
      action.parameters[rule.amountField],
      "Protocol amount",
    );
    if (
      !rule.maxAmountBaseUnits ||
      BigInt(amount) >
        BigInt(normalizeInteger(rule.maxAmountBaseUnits, "Protocol amount cap"))
    ) {
      throw new SafeExecutionPolicyError(
        "Protocol amount exceeds the allowlisted cap",
      );
    }
  }
  if (rule.tokenField && rule.tokenAddress) {
    const token = action.parameters[rule.tokenField];
    if (
      typeof token !== "string" ||
      normalizeAddress(token, "Protocol token") !==
        normalizeAddress(rule.tokenAddress, "Policy token")
    ) {
      throw new SafeExecutionPolicyError("Protocol token is not allowlisted");
    }
  }
  const body = { ...action.parameters, chainId };
  const payloadHash = `sha256:${sha256(canonicalJson(body))}`;
  return {
    body,
    path: `/api/execute/${protocol}/${actionSlug}`,
    payloadHash,
    idempotencyKey: sha256(
      [
        escapeTaskId(action.taskId),
        String(chainId),
        protocol,
        actionSlug,
        payloadHash,
      ].join("|"),
    ),
  };
};

interface TransportResult {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
  readonly rateLimit: RateLimitState;
  readonly pollAfterMs?: number;
}

const parseNumberHeader = (
  headers: Headers,
  name: string,
): number | undefined => {
  const value = headers.get(name);
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const parseRateLimit = (headers: Headers): RateLimitState => {
  const limit = parseNumberHeader(headers, "x-ratelimit-limit");
  const remaining = parseNumberHeader(headers, "x-ratelimit-remaining");
  const reset = parseNumberHeader(headers, "x-ratelimit-reset");
  const retryAfter = parseNumberHeader(headers, "retry-after");
  const resetMilliseconds =
    reset === undefined
      ? undefined
      : reset > 10_000_000_000
        ? reset
        : reset * 1_000;
  return {
    ...(limit === undefined ? {} : { limit }),
    ...(remaining === undefined ? {} : { remaining }),
    ...(resetMilliseconds === undefined
      ? {}
      : { resetAt: new Date(resetMilliseconds).toISOString() }),
    ...(retryAfter === undefined
      ? {}
      : { retryAfterMs: Math.max(0, retryAfter * 1_000) }),
  };
};

export class SafeExecutionClient {
  readonly #apiKey: string;
  readonly #origin: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;
  readonly #policy: SafeExecutionPolicy;
  readonly #logger: SafeExecutionLogger | undefined;
  readonly #now: () => number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #maxRateLimitRetries: number;
  #notBefore = 0;

  public constructor(options: SafeExecutionClientOptions) {
    if (!/^kh_[\w-]{8,}$/u.test(options.apiKey))
      throw new TypeError(
        "A KeeperHub organization key beginning with kh_ is required",
      );
    const origin = new URL(options.apiOrigin ?? KEEPERHUB_API_ORIGIN);
    if (origin.protocol !== "https:" && origin.hostname !== "localhost")
      throw new TypeError("KeeperHub API origin must use HTTPS");
    this.#apiKey = options.apiKey;
    this.#origin = origin.origin;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#policy = options.policy;
    this.#logger = options.logger;
    this.#now = options.now ?? Date.now;
    this.#sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#maxRateLimitRetries = options.maxRateLimitRetries ?? 1;
  }

  async #request(
    path: string,
    method: "GET" | "POST",
    body: Readonly<Record<string, unknown>> | undefined,
    identity: RequestIdentity,
    idempotencyKey?: string,
  ): Promise<TransportResult> {
    let rateRetries = 0;
    while (true) {
      const wait = Math.max(0, this.#notBefore - this.#now());
      if (wait > 0) await this.#sleep(wait);
      const response = await this.#fetch(`${this.#origin}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.#apiKey}`,
          accept: "application/json",
          "x-request-id": identity.requestId,
          "x-trace-id": identity.traceId,
          ...(body ? { "content-type": "application/json" } : {}),
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        },
        ...(body ? { body: canonicalJson(body) } : {}),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      const rateLimit = parseRateLimit(response.headers);
      if (rateLimit.remaining === 0 && rateLimit.resetAt) {
        this.#notBefore = Math.max(
          this.#notBefore,
          new Date(rateLimit.resetAt).getTime(),
        );
      }
      if (response.status === 429 && rateRetries < this.#maxRateLimitRetries) {
        rateRetries += 1;
        const retryAfter =
          rateLimit.retryAfterMs ?? Math.max(0, this.#notBefore - this.#now());
        if (retryAfter > 0) await this.#sleep(retryAfter);
        continue;
      }
      const parsed: unknown = await response.json().catch(() => ({}));
      const responseBody = isRecord(parsed) ? parsed : { result: parsed };
      const pollSeconds = parseNumberHeader(
        response.headers,
        "x-poll-interval-hint",
      );
      const result: TransportResult = {
        status: response.status,
        body: responseBody,
        rateLimit,
        ...(pollSeconds === undefined
          ? {}
          : { pollAfterMs: pollSeconds * 1_000 }),
      };
      if (!response.ok) {
        const message =
          typeof responseBody.message === "string"
            ? responseBody.message
            : typeof responseBody.error === "string"
              ? responseBody.error
              : `KeeperHub returned HTTP ${response.status}`;
        throw new KeeperHubExecutionError(
          message,
          response.status,
          responseBody,
          rateLimit,
        );
      }
      return result;
    }
  }

  #evidence(
    operation: KeeperHubEvidence["operation"],
    prepared: Pick<PreparedContractCall, "payloadHash" | "idempotencyKey">,
    identity: RequestIdentity,
    result: TransportResult,
    includeKey: boolean,
  ): KeeperHubEvidence {
    const executionId =
      typeof result.body.executionId === "string"
        ? result.body.executionId
        : undefined;
    const evidence: KeeperHubEvidence = {
      operation,
      payloadHash: prepared.payloadHash,
      ...(includeKey ? { idempotencyKey: prepared.idempotencyKey } : {}),
      requestId: identity.requestId,
      traceId: identity.traceId,
      rateLimit: result.rateLimit,
      ...(result.pollAfterMs === undefined
        ? {}
        : { pollAfterMs: result.pollAfterMs }),
      response: result.body,
    };
    this.#logger?.record({
      operation,
      payloadHash: prepared.payloadHash,
      ...(includeKey ? { idempotencyKey: prepared.idempotencyKey } : {}),
      requestId: identity.requestId,
      traceId: identity.traceId,
      statusCode: result.status,
      ...(executionId ? { executionId } : {}),
    });
    return evidence;
  }

  public async simulateContractCall(
    call: SafeContractCall,
    identity: RequestIdentity,
  ): Promise<SimulationEvidence> {
    const prepared = prepareContractCall(call, this.#policy);
    const result = await this.#request(
      "/api/execute/contract-call",
      "POST",
      { ...prepared.body, simulate: true },
      identity,
    );
    const evidence = this.#evidence(
      "simulation",
      prepared,
      identity,
      result,
      false,
    );
    return {
      ...evidence,
      operation: "simulation",
      approvedForBroadcast:
        result.body.success === true && result.body.wouldRevert === false,
    };
  }

  public async broadcastContractCall(
    call: SafeContractCall,
    simulation: SimulationEvidence,
    identity: RequestIdentity,
  ): Promise<KeeperHubEvidence> {
    const prepared = prepareContractCall(call, this.#policy);
    if (
      !simulation.approvedForBroadcast ||
      simulation.payloadHash !== prepared.payloadHash
    ) {
      throw new SafeExecutionPolicyError(
        "Broadcast payload does not match the approved simulation",
      );
    }
    const result = await this.#request(
      "/api/execute/contract-call",
      "POST",
      prepared.body,
      identity,
      prepared.idempotencyKey,
    );
    return this.#evidence("broadcast", prepared, identity, result, true);
  }

  public async executeProtocolAction(
    action: SafeProtocolAction,
    identity: RequestIdentity,
  ): Promise<KeeperHubEvidence> {
    const prepared = prepareProtocolAction(action, this.#policy);
    const result = await this.#request(
      prepared.path,
      "POST",
      prepared.body,
      identity,
      prepared.idempotencyKey,
    );
    return this.#evidence("protocol", prepared, identity, result, true);
  }

  public async pollExecution(
    executionId: string,
    context: Pick<KeeperHubEvidence, "payloadHash" | "idempotencyKey">,
    identity: RequestIdentity,
    maxPolls = 60,
  ): Promise<KeeperHubEvidence> {
    if (!/^[\w-]{6,128}$/u.test(executionId))
      throw new SafeExecutionPolicyError("executionId is invalid");
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      const result = await this.#request(
        `/api/execute/${encodeURIComponent(executionId)}/status`,
        "GET",
        undefined,
        identity,
      );
      const evidence = this.#evidence(
        "status",
        { ...context, idempotencyKey: context.idempotencyKey ?? "" },
        identity,
        result,
        Boolean(context.idempotencyKey),
      );
      if (result.pollAfterMs === 0) return evidence;
      await this.#sleep(result.pollAfterMs ?? 2_000);
    }
    throw new KeeperHubExecutionError(
      "KeeperHub execution did not reach a terminal status before the poll limit",
      504,
      { executionId },
      {},
    );
  }
}
