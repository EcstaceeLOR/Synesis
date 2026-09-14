import { describe, expect, it, vi } from "vitest";

import {
  SafeExecutionClient,
  SafeExecutionPolicyError,
  canonicalDecimal,
  prepareContractCall,
  type SafeContractCall,
  type SafeExecutionPolicy,
} from "./safe-execution.js";

const pool = "0x1111111111111111111111111111111111111111" as const;
const usdc = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as const;
const wallet = "0x2222222222222222222222222222222222222222" as const;
const policy: SafeExecutionPolicy = {
  contractCalls: [
    {
      chainId: 8453,
      target: pool,
      functionName: "supply",
      functionSelector: "0x617ba037",
      maxNativeValueWei: "0",
      amountArgumentIndex: 1,
      maxAmountBaseUnits: "100000000",
      tokenAddress: usdc,
      tokenLocation: 0,
    },
  ],
  protocolActions: [
    {
      chainId: 8453,
      protocol: "aave-v3",
      action: "supply",
      allowedParameterFields: ["asset", "amount", "onBehalfOf"],
      amountField: "amount",
      maxAmountBaseUnits: "100000000",
      tokenField: "asset",
      tokenAddress: usdc,
    },
  ],
};
const call = (overrides: Partial<SafeContractCall> = {}): SafeContractCall => ({
  taskId: "intent-42:agent-procurement",
  chainId: 8453,
  contractAddress: pool,
  functionName: "supply",
  functionSelector: "0x617ba037",
  functionArgs: [usdc, "1000000", wallet, 0],
  abi: [
    {
      type: "function",
      name: "supply",
      stateMutability: "nonpayable",
      inputs: [
        { type: "address", name: "asset" },
        { type: "uint256", name: "amount" },
        { type: "address", name: "onBehalfOf" },
        { type: "uint16", name: "referralCode" },
      ],
      outputs: [],
    },
  ],
  tokenAddress: usdc,
  ...overrides,
});
const identity = { requestId: "request-123", traceId: "trace-456" };
const response = (
  body: unknown,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
) => Response.json(body, { status, headers });
const requestBody = (
  fetcher: ReturnType<typeof vi.fn<typeof fetch>>,
  index: number,
): Record<string, unknown> => {
  const body = fetcher.mock.calls[index]?.[1]?.body;
  if (typeof body !== "string")
    throw new TypeError("Expected a JSON request body");
  return JSON.parse(body) as Record<string, unknown>;
};

describe("canonical KeeperHub execution", () => {
  it("normalizes decimal values and derives stable payload and economic hashes", () => {
    expect(canonicalDecimal("001.2300")).toBe("1.23");
    const first = prepareContractCall(call(), policy);
    const second = prepareContractCall(
      call({
        contractAddress: pool
          .toUpperCase()
          .replace("0X", "0x") as `0x${string}`,
        tokenAddress: usdc.toUpperCase().replace("0X", "0x") as `0x${string}`,
      }),
      policy,
    );
    expect(first.payloadHash).toBe(second.payloadHash);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first.idempotencyKey).toMatch(/^[\da-f]{64}$/u);
  });

  it.each([
    ["chain", { chainId: 1 }],
    ["target", { contractAddress: wallet }],
    ["selector", { functionSelector: "0xdeadbeef" }],
    [
      "ABI selector",
      {
        abi: [
          {
            type: "function",
            name: "supply",
            stateMutability: "nonpayable",
            inputs: [{ type: "address" }, { type: "uint256" }],
          },
        ],
      },
    ],
    ["token", { tokenAddress: wallet }],
    ["amount", { functionArgs: [usdc, "100000001", wallet, 0] }],
    ["value", { value: "0.000000000000000001" }],
  ] satisfies readonly [string, Partial<SafeContractCall>][])(
    "rejects a non-allowlisted %s before network access",
    async (_label, override) => {
      const fetcher = vi.fn<typeof fetch>();
      const client = new SafeExecutionClient({
        apiKey: "kh_example1234",
        policy,
        fetch: fetcher,
      });
      await expect(
        client.simulateContractCall(call(override), identity),
      ).rejects.toBeInstanceOf(SafeExecutionPolicyError);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("broadcasts only the exact payload approved by simulation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          {
            success: true,
            status: "simulated",
            wouldRevert: false,
            gasEstimate: "120000",
          },
          200,
          { "x-ratelimit-limit": "60", "x-ratelimit-remaining": "59" },
        ),
      )
      .mockResolvedValueOnce(
        response(
          {
            executionId: "execution-123",
            status: "completed",
            transactionHash: `0x${"a".repeat(64)}`,
          },
          202,
          { "x-poll-interval-hint": "0" },
        ),
      );
    const logs: unknown[] = [];
    const client = new SafeExecutionClient({
      apiKey: "kh_example1234",
      policy,
      fetch: fetcher,
      logger: { record: (event) => logs.push(event) },
    });

    const simulation = await client.simulateContractCall(call(), identity);
    const broadcast = await client.broadcastContractCall(
      call(),
      simulation,
      identity,
    );
    const simulatedBody = requestBody(fetcher, 0);
    const broadcastBody = requestBody(fetcher, 1);
    const { simulate: simulationFlag, ...simulationBase } = simulatedBody;

    expect(simulationFlag).toBe(true);
    expect(broadcastBody).toEqual(simulationBase);
    expect(broadcast.payloadHash).toBe(simulation.payloadHash);
    expect(
      (fetcher.mock.calls[1]?.[1]?.headers as Record<string, string>)[
        "idempotency-key"
      ],
    ).toBe(broadcast.idempotencyKey);
    expect(
      (fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>)[
        "idempotency-key"
      ],
    ).toBeUndefined();
    expect(JSON.stringify(logs)).not.toContain("kh_example1234");
    expect(logs).toMatchObject([
      {
        operation: "simulation",
        requestId: identity.requestId,
        traceId: identity.traceId,
      },
      { operation: "broadcast", executionId: "execution-123" },
    ]);
  });

  it("refuses payload drift after a successful simulation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ success: true, status: "simulated", wouldRevert: false }),
      );
    const client = new SafeExecutionClient({
      apiKey: "kh_example1234",
      policy,
      fetch: fetcher,
    });
    const simulation = await client.simulateContractCall(call(), identity);

    await expect(
      client.broadcastContractCall(
        call({ functionArgs: [usdc, "2000000", wallet, 0] }),
        simulation,
        identity,
      ),
    ).rejects.toThrow("does not match");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("KeeperHub pacing and protocol safety", () => {
  it("retries a rate limit with the same stable idempotency key", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ error: "rate limited" }, 429, { "retry-after": "3" }),
      )
      .mockResolvedValueOnce(
        response({ executionId: "execution-456", status: "completed" }, 202),
      );
    const sleep = vi.fn(() => Promise.resolve());
    const client = new SafeExecutionClient({
      apiKey: "kh_example1234",
      policy,
      fetch: fetcher,
      sleep,
    });
    const evidence = await client.executeProtocolAction(
      {
        taskId: "intent-42:aave-supply",
        chainId: 8453,
        protocol: "aave-v3",
        action: "supply",
        parameters: { asset: usdc, amount: "1000000", onBehalfOf: wallet },
      },
      identity,
    );

    expect(sleep).toHaveBeenCalledWith(3_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const firstHeaders = fetcher.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    const secondHeaders = fetcher.mock.calls[1]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(firstHeaders["idempotency-key"]).toBe(
      secondHeaders["idempotency-key"],
    );
    expect(evidence.idempotencyKey).toBe(firstHeaders["idempotency-key"]);
  });

  it("uses the poll hint as terminal truth even for an unknown status", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ executionId: "execution-789", status: "unconfirmed" }, 200, {
          "x-poll-interval-hint": "0.01",
        }),
      )
      .mockResolvedValueOnce(
        response(
          { executionId: "execution-789", status: "settled-new-status" },
          200,
          { "x-poll-interval-hint": "0" },
        ),
      );
    const sleep = vi.fn(() => Promise.resolve());
    const client = new SafeExecutionClient({
      apiKey: "kh_example1234",
      policy,
      fetch: fetcher,
      sleep,
    });
    const evidence = await client.pollExecution(
      "execution-789",
      { payloadHash: `sha256:${"a".repeat(64)}`, idempotencyKey: "stable-key" },
      identity,
    );

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(10);
    expect(evidence.response.status).toBe("settled-new-status");
    expect(evidence.pollAfterMs).toBe(0);
  });

  it("rejects undeclared protocol fields before network access", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new SafeExecutionClient({
      apiKey: "kh_example1234",
      policy,
      fetch: fetcher,
    });
    await expect(
      client.executeProtocolAction(
        {
          taskId: "intent-42:aave-supply",
          chainId: 8453,
          protocol: "aave-v3",
          action: "supply",
          parameters: {
            asset: usdc,
            amount: "1",
            onBehalfOf: wallet,
            dangerousOverride: true,
          },
        },
        identity,
      ),
    ).rejects.toThrow("not allowlisted");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
