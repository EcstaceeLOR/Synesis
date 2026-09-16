import { describe, expect, it, vi } from "vitest";

import fixtures from "./fixtures/keeperhub-reconciliation.json";
import {
  BASE_MAINNET_CHAIN_ID,
  ReceiptVerificationClient,
  SAFE_EXECUTION_FAILURE_TOPIC,
  type ReceiptClassification,
} from "./receipt-verification.js";
import type { KeeperHubEvidence } from "./safe-execution.js";

type Fixture = {
  readonly name: string;
  readonly keeperHub: {
    readonly status: string;
    readonly verified: boolean;
    readonly receiptStatus: string;
    readonly safeInnerFailure?: boolean;
  };
  readonly rpcReceipt: "success" | "reverted" | null;
  readonly deadline?: "expired";
  readonly expectedClassification: ReceiptClassification;
};

const recordedFixtures = fixtures as readonly Fixture[];
const executionId = "recorded-execution-1";
const transactionHash = `0x${"12".repeat(32)}` as const;
const safeAddress = `0x${"99".repeat(20)}` as const;
const now = Date.parse("2026-09-16T00:00:00.000Z");

const receipt = (status: "success" | "reverted", safeInnerFailure = false) => ({
  transactionHash,
  blockHash: `0x${"34".repeat(32)}`,
  blockNumber: "0x20",
  transactionIndex: "0x1",
  from: `0x${"56".repeat(20)}`,
  to: safeInnerFailure ? safeAddress : `0x${"78".repeat(20)}`,
  cumulativeGasUsed: "0x5208",
  gasUsed: "0x5208",
  effectiveGasPrice: "0x3b9aca00",
  status: status === "success" ? "0x1" : "0x0",
  logs: safeInnerFailure
    ? [
        {
          address: safeAddress,
          topics: [SAFE_EXECUTION_FAILURE_TOPIC],
          data: "0x",
          logIndex: "0x0",
        },
      ]
    : [],
});

const rpcFetch = (result: unknown) =>
  vi.fn((_url: string | URL | Request, init?: RequestInit) => {
    if (typeof init?.body !== "string") throw new Error("Missing RPC body");
    const body = JSON.parse(init.body) as { method: string };
    return Promise.resolve(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: body.method === "eth_chainId" ? 1 : 2,
          result: body.method === "eth_chainId" ? "0x2105" : result,
        }),
      ),
    );
  });

describe("recorded KeeperHub reconciliation contracts", () => {
  it.each(recordedFixtures)(
    "replays $name without a live network or value movement",
    async (fixture) => {
      const keeperReceipt =
        fixture.keeperHub.receiptStatus === "unknown"
          ? undefined
          : receipt(
              fixture.keeperHub.receiptStatus as "success" | "reverted",
              fixture.keeperHub.safeInnerFailure,
            );
      const evidence: KeeperHubEvidence = {
        operation: "status",
        payloadHash: `sha256:${"ab".repeat(32)}`,
        idempotencyKey: "recorded-economic-key",
        requestId: "recorded-request-1",
        traceId: "recorded-trace-1",
        rateLimit: {},
        pollAfterMs: 0,
        response: {
          executionId,
          status: fixture.keeperHub.status,
          ...(keeperReceipt ? { transactionHash, receipt: keeperReceipt } : {}),
          verified: fixture.keeperHub.verified,
          receiptStatus: fixture.keeperHub.receiptStatus,
        },
      };
      const fetch = rpcFetch(
        fixture.rpcReceipt
          ? receipt(fixture.rpcReceipt, fixture.keeperHub.safeInnerFailure)
          : null,
      );
      const getExecutionStatus = vi.fn(() => Promise.resolve(evidence));
      const client = new ReceiptVerificationClient({
        executionClient: { getExecutionStatus },
        rpcUrl: "https://base-rpc.recorded-fixture.invalid",
        fetch,
        now: () => now,
      });

      const result = await client.reconcile({
        executionId,
        payloadHash: evidence.payloadHash,
        idempotencyKey: evidence.idempotencyKey!,
        identity: { requestId: evidence.requestId, traceId: evidence.traceId },
        expectedChainId: BASE_MAINNET_CHAIN_ID,
        deadlineAt:
          fixture.deadline === "expired"
            ? "2026-09-15T23:59:59.000Z"
            : "2026-09-16T00:05:00.000Z",
        ...(fixture.keeperHub.safeInnerFailure ? { safeAddress } : {}),
      });

      expect(result.classification).toBe(fixture.expectedClassification);
      expect(result.rebroadcastAllowed).toBe(false);
      expect(getExecutionStatus).toHaveBeenCalledTimes(1);
    },
  );
});
