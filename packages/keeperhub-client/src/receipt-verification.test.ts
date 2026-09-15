import { describe, expect, it, vi } from "vitest";

import type { KeeperHubEvidence, RequestIdentity } from "./safe-execution.js";
import {
  BASE_MAINNET_CHAIN_ID,
  ReceiptVerificationClient,
  SAFE_EXECUTION_FAILURE_TOPIC,
  hashReceiptFields,
  normalizeReceiptFields,
  type ReceiptReconciliationInput,
} from "./receipt-verification.js";

const executionId = "execution-recovery-123";
const transactionHash = `0x${"12".repeat(32)}` as const;
const blockHash = `0x${"34".repeat(32)}` as const;
const wallet = `0x${"56".repeat(20)}` as const;
const target = `0x${"78".repeat(20)}` as const;
const safe = `0x${"9a".repeat(20)}` as const;
const now = Date.parse("2026-09-14T12:00:00.000Z");

const receipt = (overrides: Record<string, unknown> = {}) => ({
  transactionHash,
  blockHash,
  blockNumber: "0x20",
  transactionIndex: "0x1",
  from: wallet,
  to: target,
  cumulativeGasUsed: "0x5208",
  gasUsed: "0x5208",
  effectiveGasPrice: "0x3b9aca00",
  status: "0x1",
  logs: [],
  ...overrides,
});

const evidence = (
  response: Readonly<Record<string, unknown>>,
): KeeperHubEvidence => ({
  operation: "status",
  payloadHash: `sha256:${"ab".repeat(32)}`,
  idempotencyKey: "economic-effect-key",
  requestId: "request-receipt-1",
  traceId: "trace-receipt-1",
  rateLimit: {},
  pollAfterMs: 0,
  response,
});

const keeperResponse = (
  receiptValue: Readonly<Record<string, unknown>> = receipt(),
  overrides: Record<string, unknown> = {},
) => ({
  executionId,
  status: "completed",
  transactionHash,
  verified: true,
  receiptStatus: "success",
  receipt: receiptValue,
  ...overrides,
});

const input = (
  overrides: Partial<ReceiptReconciliationInput> = {},
): ReceiptReconciliationInput => ({
  executionId,
  payloadHash: `sha256:${"ab".repeat(32)}`,
  idempotencyKey: "economic-effect-key",
  identity: {
    requestId: "request-receipt-1",
    traceId: "trace-receipt-1",
  },
  expectedChainId: BASE_MAINNET_CHAIN_ID,
  deadlineAt: "2026-09-14T12:05:00.000Z",
  ...overrides,
});

const rpcFetch = (...receiptResults: readonly unknown[]) => {
  let receiptIndex = 0;
  return vi.fn((_url: string | URL | Request, init?: RequestInit) => {
    if (typeof init?.body !== "string") throw new Error("Missing RPC body");
    const request = JSON.parse(init.body) as { method: string };
    if (request.method === "eth_chainId") {
      return Promise.resolve(
        new Response(
          JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x2105" }),
        ),
      );
    }
    const result = receiptResults[receiptIndex];
    receiptIndex += 1;
    return Promise.resolve(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result })),
    );
  });
};

const statusReader = (response: Readonly<Record<string, unknown>>) =>
  vi.fn(
    (
      _executionId: string,
      _context: Pick<KeeperHubEvidence, "payloadHash" | "idempotencyKey">,
      _identity: RequestIdentity,
    ) => {
      void _executionId;
      void _context;
      void _identity;
      return Promise.resolve(evidence(response));
    },
  );

describe("independent KeeperHub receipt verification", () => {
  it("canonicalizes and hashes equivalent RPC receipt fields identically", () => {
    const hexadecimal = normalizeReceiptFields(receipt());
    const decimal = normalizeReceiptFields(
      receipt({
        blockNumber: 32,
        transactionIndex: "1",
        cumulativeGasUsed: "21000",
        gasUsed: 21_000,
        effectiveGasPrice: "1000000000",
        status: 1,
      }),
    );
    expect(hashReceiptFields(decimal)).toBe(hashReceiptFields(hexadecimal));
  });

  it("freezes delayed receipt persistence and reconciles the same execution", async () => {
    const getExecutionStatus = statusReader(keeperResponse());
    const fetch = rpcFetch(null, receipt());
    const client = new ReceiptVerificationClient({
      executionClient: { getExecutionStatus },
      rpcUrl: "https://base-rpc.example",
      fetch,
      now: () => now,
    });

    const delayed = await client.reconcile(input());
    const confirmed = await client.reconcile(input());

    expect(delayed).toMatchObject({
      executionId,
      classification: "UNCONFIRMED",
      intentDisposition: "UNCONFIRMED",
      nextAction: "RECONCILE_SAME_EXECUTION",
      frozen: true,
      rebroadcastAllowed: false,
    });
    expect(confirmed).toMatchObject({
      executionId,
      classification: "VERIFIED_SUCCESS",
      intentDisposition: "SUCCEEDED",
      nextAction: "COMPLETE",
      frozen: false,
      rebroadcastAllowed: false,
      keeperHubReceiptHash: confirmed.rpcReceiptHash,
    });
    expect(getExecutionStatus).toHaveBeenCalledTimes(2);
    expect(getExecutionStatus.mock.calls.map(([id]) => id)).toEqual([
      executionId,
      executionId,
    ]);
  });

  it("classifies a matching reverted call as failed", async () => {
    const reverted = receipt({ status: "0x0" });
    const client = new ReceiptVerificationClient({
      executionClient: {
        getExecutionStatus: statusReader(
          keeperResponse(reverted, {
            verified: true,
            receiptStatus: "reverted",
          }),
        ),
      },
      rpcUrl: "https://base-rpc.example",
      fetch: rpcFetch(reverted),
      now: () => now,
    });

    await expect(client.reconcile(input())).resolves.toMatchObject({
      classification: "REVERTED",
      intentDisposition: "FAILED",
      nextAction: "FAIL",
      rebroadcastAllowed: false,
    });
  });

  it("times out a missing transaction hash without calling RPC", async () => {
    const fetch = rpcFetch();
    const client = new ReceiptVerificationClient({
      executionClient: {
        getExecutionStatus: statusReader({
          executionId,
          status: "unconfirmed",
        }),
      },
      rpcUrl: "https://base-rpc.example",
      fetch,
      now: () => now,
    });

    const result = await client.reconcile(
      input({ deadlineAt: "2026-09-14T11:59:59.000Z" }),
    );
    expect(result).toMatchObject({
      classification: "TIMED_OUT",
      intentDisposition: "FAILED",
      rebroadcastAllowed: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never accepts completed status and a transaction hash without explicit verification", async () => {
    const client = new ReceiptVerificationClient({
      executionClient: {
        getExecutionStatus: statusReader(
          keeperResponse(receipt(), {
            verified: false,
            receiptStatus: "unknown",
          }),
        ),
      },
      rpcUrl: "https://base-rpc.example",
      fetch: rpcFetch(receipt()),
      now: () => now,
    });

    await expect(client.reconcile(input())).resolves.toMatchObject({
      classification: "UNCONFIRMED",
      nextAction: "RECONCILE_SAME_EXECUTION",
      frozen: true,
      rebroadcastAllowed: false,
    });
  });

  it("fails closed when KeeperHub and RPC receipt fields differ", async () => {
    const client = new ReceiptVerificationClient({
      executionClient: {
        getExecutionStatus: statusReader(keeperResponse()),
      },
      rpcUrl: "https://base-rpc.example",
      fetch: rpcFetch(receipt({ gasUsed: "0x5300" })),
      now: () => now,
    });

    const result = await client.reconcile(input());
    expect(result).toMatchObject({
      classification: "EVIDENCE_MISMATCH",
      intentDisposition: "FAILED",
    });
    expect(result.keeperHubReceiptHash).not.toBe(result.rpcReceiptHash);
  });

  it("detects a Safe inner failure despite a successful outer receipt", async () => {
    const safeFailure = receipt({
      to: safe,
      logs: [
        {
          address: safe,
          topics: [SAFE_EXECUTION_FAILURE_TOPIC],
          data: "0x",
          logIndex: "0x0",
        },
      ],
    });
    const client = new ReceiptVerificationClient({
      executionClient: {
        getExecutionStatus: statusReader(keeperResponse(safeFailure)),
      },
      rpcUrl: "https://base-rpc.example",
      fetch: rpcFetch(safeFailure),
      now: () => now,
    });

    await expect(
      client.reconcile(input({ safeAddress: safe })),
    ).resolves.toMatchObject({
      classification: "SAFE_INNER_FAILURE",
      intentDisposition: "FAILED",
      rebroadcastAllowed: false,
    });
  });

  it("rejects a non-Base RPC before requesting a receipt", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" })),
      ),
    );
    const client = new ReceiptVerificationClient({
      executionClient: {
        getExecutionStatus: statusReader(keeperResponse()),
      },
      rpcUrl: "https://wrong-chain.example",
      fetch,
      now: () => now,
    });

    await expect(client.reconcile(input())).resolves.toMatchObject({
      classification: "EVIDENCE_MISMATCH",
      reason: "Independent RPC is not Base mainnet",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
