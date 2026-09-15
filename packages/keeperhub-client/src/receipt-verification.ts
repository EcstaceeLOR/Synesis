import { createHash } from "node:crypto";

import { bytesToHex } from "@noble/hashes/utils.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

import {
  canonicalJson,
  type KeeperHubEvidence,
  type RequestIdentity,
  type SafeExecutionClient,
} from "./safe-execution.js";

type Address = `0x${string}`;
type TransactionHash = `0x${string}`;

export const BASE_MAINNET_CHAIN_ID = 8453;

export type ReceiptClassification =
  | "VERIFIED_SUCCESS"
  | "REVERTED"
  | "SAFE_INNER_FAILURE"
  | "UNCONFIRMED"
  | "TIMED_OUT"
  | "EVIDENCE_MISMATCH";

export interface EvmLog {
  readonly address: Address;
  readonly topics: readonly `0x${string}`[];
  readonly data: `0x${string}`;
  readonly logIndex: string;
}

export interface CanonicalReceiptFields {
  readonly transactionHash: TransactionHash;
  readonly blockHash: `0x${string}`;
  readonly blockNumber: string;
  readonly transactionIndex: string;
  readonly from: Address;
  readonly to: Address | null;
  readonly cumulativeGasUsed: string;
  readonly gasUsed: string;
  readonly effectiveGasPrice: string;
  readonly status: "success" | "reverted";
  readonly logs: readonly EvmLog[];
}

export interface ReceiptReconciliationInput {
  readonly executionId: string;
  readonly payloadHash: string;
  readonly idempotencyKey?: string;
  readonly identity: RequestIdentity;
  readonly expectedChainId: typeof BASE_MAINNET_CHAIN_ID;
  readonly expectedTransactionHash?: TransactionHash;
  readonly deadlineAt: string;
  readonly safeAddress?: Address;
  readonly requireSafeSuccessEvent?: boolean;
}

export interface ReceiptReconciliationResult {
  readonly executionId: string;
  readonly classification: ReceiptClassification;
  readonly intentDisposition: "SUCCEEDED" | "FAILED" | "UNCONFIRMED";
  readonly nextAction: "COMPLETE" | "FAIL" | "RECONCILE_SAME_EXECUTION";
  readonly frozen: boolean;
  readonly rebroadcastAllowed: false;
  readonly reason: string;
  readonly observedAt: string;
  readonly transactionHash?: TransactionHash;
  readonly keeperHubReceiptHash?: string;
  readonly rpcReceiptHash?: string;
  readonly keeperHubEvidence: KeeperHubEvidence;
}

export interface ReceiptVerificationLogger {
  record(event: {
    readonly executionId: string;
    readonly classification: ReceiptClassification;
    readonly requestId: string;
    readonly traceId: string;
    readonly transactionHash?: TransactionHash;
    readonly keeperHubReceiptHash?: string;
    readonly rpcReceiptHash?: string;
  }): void;
}

export interface ReceiptVerificationClientOptions {
  readonly executionClient: Pick<SafeExecutionClient, "getExecutionStatus">;
  readonly rpcUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  readonly logger?: ReceiptVerificationLogger;
}

export class ReceiptEvidenceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ReceiptEvidenceError";
  }
}

interface NormalizedKeeperHubReceipt {
  readonly executionId?: string;
  readonly transactionHash?: TransactionHash;
  readonly verified: boolean;
  readonly receiptStatus: "success" | "reverted" | "unknown";
  readonly fields?: CanonicalReceiptFields;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const addressPattern = /^0x[\da-f]{40}$/iu;
const transactionHashPattern = /^0x[\da-f]{64}$/iu;
const bytesPattern = /^0x(?:[\da-f]{2})*$/iu;
const quantityPattern = /^0x[\da-f]+$/iu;

const normalizeAddress = (value: unknown, label: string): Address => {
  if (typeof value !== "string" || !addressPattern.test(value)) {
    throw new ReceiptEvidenceError(`${label} is not an EVM address`);
  }
  return value.toLowerCase() as Address;
};

const normalizeTransactionHash = (
  value: unknown,
  label: string,
): TransactionHash => {
  if (typeof value !== "string" || !transactionHashPattern.test(value)) {
    throw new ReceiptEvidenceError(`${label} is not a transaction hash`);
  }
  return value.toLowerCase() as TransactionHash;
};

const normalizeBytes = (value: unknown, label: string): `0x${string}` => {
  if (typeof value !== "string" || !bytesPattern.test(value)) {
    throw new ReceiptEvidenceError(`${label} is not canonical EVM bytes`);
  }
  return value.toLowerCase() as `0x${string}`;
};

const normalizeQuantity = (value: unknown, label: string): string => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return `0x${value.toString(16)}`;
  }
  if (typeof value !== "string") {
    throw new ReceiptEvidenceError(`${label} is not an EVM quantity`);
  }
  const trimmed = value.trim();
  if (/^\d+$/u.test(trimmed)) return `0x${BigInt(trimmed).toString(16)}`;
  if (!quantityPattern.test(trimmed)) {
    throw new ReceiptEvidenceError(`${label} is not an EVM quantity`);
  }
  return `0x${BigInt(trimmed).toString(16)}`;
};

const normalizeReceiptStatus = (value: unknown): "success" | "reverted" => {
  if (value === true || value === 1 || value === "1" || value === "0x1") {
    return "success";
  }
  if (value === false || value === 0 || value === "0" || value === "0x0") {
    return "reverted";
  }
  if (value === "success" || value === "reverted") return value;
  throw new ReceiptEvidenceError(
    "Receipt status is neither success nor reverted",
  );
};

const normalizeLog = (value: unknown, position: number): EvmLog => {
  const source = record(value);
  if (!source)
    throw new ReceiptEvidenceError(`Receipt log ${position} is invalid`);
  if (!Array.isArray(source.topics)) {
    throw new ReceiptEvidenceError(
      `Receipt log ${position} topics are invalid`,
    );
  }
  return {
    address: normalizeAddress(
      source.address,
      `Receipt log ${position} address`,
    ),
    topics: source.topics.map((topic, topicPosition) =>
      normalizeBytes(topic, `Receipt log ${position} topic ${topicPosition}`),
    ),
    data: normalizeBytes(source.data, `Receipt log ${position} data`),
    logIndex: normalizeQuantity(
      source.logIndex,
      `Receipt log ${position} logIndex`,
    ),
  };
};

export const normalizeReceiptFields = (
  value: unknown,
): CanonicalReceiptFields => {
  const source = record(value);
  if (!source) throw new ReceiptEvidenceError("Receipt is not an object");
  if (!Array.isArray(source.logs)) {
    throw new ReceiptEvidenceError("Receipt logs are missing");
  }
  return {
    transactionHash: normalizeTransactionHash(
      source.transactionHash,
      "Receipt transactionHash",
    ),
    blockHash: normalizeBytes(source.blockHash, "Receipt blockHash"),
    blockNumber: normalizeQuantity(source.blockNumber, "Receipt blockNumber"),
    transactionIndex: normalizeQuantity(
      source.transactionIndex,
      "Receipt transactionIndex",
    ),
    from: normalizeAddress(source.from, "Receipt from"),
    to: source.to === null ? null : normalizeAddress(source.to, "Receipt to"),
    cumulativeGasUsed: normalizeQuantity(
      source.cumulativeGasUsed,
      "Receipt cumulativeGasUsed",
    ),
    gasUsed: normalizeQuantity(source.gasUsed, "Receipt gasUsed"),
    effectiveGasPrice: normalizeQuantity(
      source.effectiveGasPrice,
      "Receipt effectiveGasPrice",
    ),
    status: normalizeReceiptStatus(source.status),
    logs: source.logs.map(normalizeLog),
  };
};

export const hashReceiptFields = (fields: CanonicalReceiptFields): string =>
  `sha256:${createHash("sha256").update(canonicalJson(fields)).digest("hex")}`;

const nestedReceipt = (
  response: Readonly<Record<string, unknown>>,
): Record<string, unknown> | undefined =>
  record(response.receipt) ?? record(record(response.result)?.receipt);

const normalizeKeeperHubReceipt = (
  evidence: KeeperHubEvidence,
): NormalizedKeeperHubReceipt => {
  const response = evidence.response;
  const result = record(response.result);
  const receipt = nestedReceipt(response);
  const sources = [
    response,
    ...(result ? [result] : []),
    ...(receipt ? [receipt] : []),
  ];
  const first = (...keys: readonly string[]): unknown => {
    for (const source of sources) {
      for (const key of keys) {
        if (source[key] !== undefined) return source[key];
      }
    }
    return undefined;
  };
  const rawReceiptStatus = first("receiptStatus");
  const receiptStatus =
    rawReceiptStatus === "success" || rawReceiptStatus === "reverted"
      ? rawReceiptStatus
      : "unknown";
  const transactionHashValue = first("transactionHash", "txHash");
  let transactionHash: TransactionHash | undefined;
  if (transactionHashValue !== undefined) {
    transactionHash = normalizeTransactionHash(
      transactionHashValue,
      "KeeperHub transaction hash",
    );
  }
  let fields: CanonicalReceiptFields | undefined;
  if (receipt) fields = normalizeReceiptFields(receipt);
  return {
    ...(typeof first("executionId") === "string"
      ? { executionId: first("executionId") as string }
      : {}),
    ...(transactionHash ? { transactionHash } : {}),
    verified: first("verified") === true,
    receiptStatus,
    ...(fields ? { fields } : {}),
  };
};

const eventTopic = (signature: string): `0x${string}` =>
  `0x${bytesToHex(keccak_256(new TextEncoder().encode(signature)))}`;

export const SAFE_EXECUTION_SUCCESS_TOPIC = eventTopic(
  "ExecutionSuccess(bytes32,uint256)",
);
export const SAFE_EXECUTION_FAILURE_TOPIC = eventTopic(
  "ExecutionFailure(bytes32,uint256)",
);

const safeOutcome = (
  fields: CanonicalReceiptFields,
  safeAddress: Address | undefined,
): "success" | "failure" | "missing" | "not-applicable" => {
  if (!safeAddress) return "not-applicable";
  const safeLogs = fields.logs.filter(
    (entry) => entry.address === safeAddress.toLowerCase(),
  );
  if (
    safeLogs.some((entry) => entry.topics[0] === SAFE_EXECUTION_FAILURE_TOPIC)
  ) {
    return "failure";
  }
  if (
    safeLogs.some((entry) => entry.topics[0] === SAFE_EXECUTION_SUCCESS_TOPIC)
  ) {
    return "success";
  }
  return "missing";
};

interface JsonRpcResponse {
  readonly jsonrpc?: unknown;
  readonly id?: unknown;
  readonly result?: unknown;
  readonly error?: unknown;
}

export class ReceiptVerificationClient {
  readonly #executionClient: Pick<SafeExecutionClient, "getExecutionStatus">;
  readonly #rpcUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;
  readonly #now: () => number;
  readonly #logger: ReceiptVerificationLogger | undefined;

  public constructor(options: ReceiptVerificationClientOptions) {
    const rpcUrl = new URL(options.rpcUrl);
    if (rpcUrl.protocol !== "https:" && rpcUrl.hostname !== "localhost") {
      throw new TypeError("Base RPC URL must use HTTPS");
    }
    this.#executionClient = options.executionClient;
    this.#rpcUrl = rpcUrl.toString();
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 15_000;
    this.#now = options.now ?? Date.now;
    this.#logger = options.logger;
  }

  async #rpc(method: string, parameters: readonly unknown[], id: string) {
    const response = await this.#fetch(this.#rpcUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: canonicalJson({ jsonrpc: "2.0", id, method, params: parameters }),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    const payload: unknown = await response.json().catch(() => undefined);
    const parsed = record(payload) as JsonRpcResponse | undefined;
    if (!response.ok || !parsed || parsed.error !== undefined) {
      throw new ReceiptEvidenceError(`Base RPC ${method} failed`);
    }
    return parsed.result;
  }

  #result(
    input: ReceiptReconciliationInput,
    evidence: KeeperHubEvidence,
    classification: ReceiptClassification,
    reason: string,
    hashes: {
      readonly transactionHash?: TransactionHash;
      readonly keeperHubReceiptHash?: string;
      readonly rpcReceiptHash?: string;
    } = {},
  ): ReceiptReconciliationResult {
    const pending = classification === "UNCONFIRMED";
    const success = classification === "VERIFIED_SUCCESS";
    const result: ReceiptReconciliationResult = {
      executionId: input.executionId,
      classification,
      intentDisposition: success
        ? "SUCCEEDED"
        : pending
          ? "UNCONFIRMED"
          : "FAILED",
      nextAction: success
        ? "COMPLETE"
        : pending
          ? "RECONCILE_SAME_EXECUTION"
          : "FAIL",
      frozen: pending,
      rebroadcastAllowed: false,
      reason,
      observedAt: new Date(this.#now()).toISOString(),
      ...hashes,
      keeperHubEvidence: evidence,
    };
    this.#logger?.record({
      executionId: input.executionId,
      classification,
      requestId: input.identity.requestId,
      traceId: input.identity.traceId,
      ...hashes,
    });
    return result;
  }

  public async reconcile(
    input: ReceiptReconciliationInput,
  ): Promise<ReceiptReconciliationResult> {
    if (input.expectedChainId !== BASE_MAINNET_CHAIN_ID) {
      throw new ReceiptEvidenceError(
        "Receipt verification is restricted to Base mainnet",
      );
    }
    const deadline = Date.parse(input.deadlineAt);
    if (!Number.isFinite(deadline)) {
      throw new ReceiptEvidenceError("Receipt deadline is invalid");
    }
    const evidence = await this.#executionClient.getExecutionStatus(
      input.executionId,
      {
        payloadHash: input.payloadHash,
        ...(input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : {}),
      },
      input.identity,
    );

    let keeperHub: NormalizedKeeperHubReceipt;
    try {
      keeperHub = normalizeKeeperHubReceipt(evidence);
    } catch (error) {
      return this.#result(
        input,
        evidence,
        "EVIDENCE_MISMATCH",
        error instanceof Error
          ? error.message
          : "KeeperHub receipt is malformed",
      );
    }
    if (
      keeperHub.executionId !== undefined &&
      keeperHub.executionId !== input.executionId
    ) {
      return this.#result(
        input,
        evidence,
        "EVIDENCE_MISMATCH",
        "KeeperHub returned a different execution ID",
      );
    }
    if (
      input.expectedTransactionHash &&
      keeperHub.transactionHash &&
      keeperHub.transactionHash !== input.expectedTransactionHash.toLowerCase()
    ) {
      return this.#result(
        input,
        evidence,
        "EVIDENCE_MISMATCH",
        "KeeperHub returned a different transaction hash",
        { transactionHash: keeperHub.transactionHash },
      );
    }
    if (!keeperHub.transactionHash) {
      return this.#result(
        input,
        evidence,
        this.#now() >= deadline ? "TIMED_OUT" : "UNCONFIRMED",
        "KeeperHub has not persisted a transaction hash",
      );
    }

    const chainId = await this.#rpc(
      "eth_chainId",
      [],
      `${input.identity.requestId}-chain`,
    );
    if (normalizeQuantity(chainId, "RPC chain ID") !== "0x2105") {
      return this.#result(
        input,
        evidence,
        "EVIDENCE_MISMATCH",
        "Independent RPC is not Base mainnet",
        { transactionHash: keeperHub.transactionHash },
      );
    }
    const rawRpcReceipt = await this.#rpc(
      "eth_getTransactionReceipt",
      [keeperHub.transactionHash],
      `${input.identity.requestId}-receipt`,
    );
    if (rawRpcReceipt === null || rawRpcReceipt === undefined) {
      return this.#result(
        input,
        evidence,
        this.#now() >= deadline ? "TIMED_OUT" : "UNCONFIRMED",
        "Independent Base receipt is not available yet",
        { transactionHash: keeperHub.transactionHash },
      );
    }

    let rpcFields: CanonicalReceiptFields;
    try {
      rpcFields = normalizeReceiptFields(rawRpcReceipt);
    } catch (error) {
      return this.#result(
        input,
        evidence,
        "EVIDENCE_MISMATCH",
        error instanceof Error ? error.message : "Base receipt is malformed",
        { transactionHash: keeperHub.transactionHash },
      );
    }
    if (rpcFields.transactionHash !== keeperHub.transactionHash) {
      return this.#result(
        input,
        evidence,
        "EVIDENCE_MISMATCH",
        "Independent receipt belongs to a different transaction",
        { transactionHash: keeperHub.transactionHash },
      );
    }
    if (!keeperHub.fields) {
      return this.#result(
        input,
        evidence,
        this.#now() >= deadline ? "TIMED_OUT" : "UNCONFIRMED",
        "KeeperHub has not persisted its verified receipt fields",
        { transactionHash: keeperHub.transactionHash },
      );
    }
    const keeperHubReceiptHash = hashReceiptFields(keeperHub.fields);
    const rpcReceiptHash = hashReceiptFields(rpcFields);
    const hashes = {
      transactionHash: keeperHub.transactionHash,
      keeperHubReceiptHash,
      rpcReceiptHash,
    };
    if (keeperHubReceiptHash !== rpcReceiptHash) {
      return this.#result(
        input,
        evidence,
        "EVIDENCE_MISMATCH",
        "KeeperHub and independent Base receipt hashes differ",
        hashes,
      );
    }
    const safe = safeOutcome(rpcFields, input.safeAddress);
    if (safe === "failure") {
      return this.#result(
        input,
        evidence,
        "SAFE_INNER_FAILURE",
        "Safe emitted ExecutionFailure despite a successful outer transaction",
        hashes,
      );
    }
    if (rpcFields.status === "reverted") {
      return this.#result(
        input,
        evidence,
        "REVERTED",
        "Independent Base receipt reports a reverted transaction",
        hashes,
      );
    }
    if (
      input.safeAddress &&
      input.requireSafeSuccessEvent !== false &&
      safe !== "success"
    ) {
      return this.#result(
        input,
        evidence,
        this.#now() >= deadline ? "TIMED_OUT" : "UNCONFIRMED",
        "Expected Safe ExecutionSuccess event is not available",
        hashes,
      );
    }
    if (keeperHub.verified && keeperHub.receiptStatus === "success") {
      return this.#result(
        input,
        evidence,
        "VERIFIED_SUCCESS",
        "KeeperHub verification and independent Base receipt agree",
        hashes,
      );
    }
    return this.#result(
      input,
      evidence,
      this.#now() >= deadline ? "TIMED_OUT" : "UNCONFIRMED",
      "KeeperHub has not asserted verified: true and receiptStatus: success",
      hashes,
    );
  }
}
