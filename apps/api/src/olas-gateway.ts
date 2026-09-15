import { randomUUID, timingSafeEqual } from "node:crypto";

import type { SynesisStore } from "@synesis/database";
import {
  KeeperHubClient,
  ReceiptVerificationClient,
  SafeExecutionClient,
  prepareContractCall,
  type ReceiptReconciliationResult,
  type SafeContractCall,
  type SafeExecutionClient as SafeExecutionClientType,
  type SafeExecutionPolicy,
} from "@synesis/keeperhub-client";
import {
  BASE_DEPLOYMENT_MANIFEST,
  extractMarketplaceRequestId,
  validateCalldata,
  type Address,
  type DecodedAllowedCall,
  type Hex,
} from "@synesis/olas-contracts";

import type { ExecutionCredentials } from "./integrations.js";
import type { MechDirectoryReader } from "./mechs.js";

export interface OlasGatewayInput {
  readonly economicIntentId: string;
  readonly mechAddress: Address;
  readonly approvedMaximumAmount: string;
  readonly approvalReference: string;
  readonly manifestVersion: string;
  readonly manifestHash: string;
  readonly chainId: 8453;
  readonly from: Address;
  readonly to: Address;
  readonly value: 0;
  readonly data: Hex;
}

export interface OlasGatewayReceipt {
  readonly executionId: string;
  readonly transactionHash: Hex;
  readonly verified: true;
  readonly receiptStatus: "success";
  readonly requestId?: Hex;
}

export class OlasGatewayError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 422,
  ) {
    super(message);
    this.name = "OlasGatewayError";
  }
}

interface ExecutionClients {
  readonly walletAddress: Address;
  readonly execution: Pick<
    SafeExecutionClientType,
    "simulateContractCall" | "broadcastContractCall"
  >;
  readonly receipt: {
    reconcile(
      input: Parameters<ReceiptVerificationClient["reconcile"]>[0],
    ): Promise<ReceiptReconciliationResult>;
  };
}

export interface OlasKeeperHubGatewayOptions {
  readonly store: SynesisStore;
  readonly mechDirectory: MechDirectoryReader;
  readonly loadCredentials: (
    organizationId: string,
  ) => Promise<ExecutionCredentials>;
  readonly keeperHubOrigin?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => Date;
  readonly createClients?: (input: {
    readonly organizationId: string;
    readonly policy: SafeExecutionPolicy;
  }) => Promise<ExecutionClients>;
}

const addressPattern = /^0x[\da-f]{40}$/iu;
const hashPattern = /^sha256:[\da-f]{64}$/u;
const uintPattern = /^\d+$/u;
const txPattern = /^0x[\da-f]{64}$/iu;

const address = (value: unknown, label: string): Address => {
  if (typeof value !== "string" || !addressPattern.test(value))
    throw new OlasGatewayError(
      "INVALID_CALL",
      `${label} must be an EVM address`,
    );
  return value.toLowerCase() as Address;
};

export const parseOlasGatewayInput = (value: unknown): OlasGatewayInput => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new OlasGatewayError(
      "INVALID_CALL",
      "Gateway input must be an object",
    );
  const input = value as Record<string, unknown>;
  const allowed = new Set([
    "economicIntentId",
    "mechAddress",
    "approvedMaximumAmount",
    "approvalReference",
    "manifestVersion",
    "manifestHash",
    "chainId",
    "from",
    "to",
    "value",
    "data",
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new OlasGatewayError(
      "INVALID_CALL",
      "Gateway input contains unknown fields",
    );
  if (
    typeof input.economicIntentId !== "string" ||
    input.economicIntentId.length < 3 ||
    typeof input.approvalReference !== "string" ||
    input.approvalReference.length < 8 ||
    typeof input.manifestVersion !== "string" ||
    !hashPattern.test(String(input.manifestHash)) ||
    !uintPattern.test(String(input.approvedMaximumAmount)) ||
    input.chainId !== 8453 ||
    input.value !== 0 ||
    typeof input.data !== "string" ||
    !/^0x[\da-f]+$/iu.test(input.data)
  ) {
    throw new OlasGatewayError("INVALID_CALL", "Gateway input is malformed");
  }
  return {
    economicIntentId: input.economicIntentId,
    mechAddress: address(input.mechAddress, "Mech address"),
    approvedMaximumAmount: String(input.approvedMaximumAmount),
    approvalReference: input.approvalReference,
    manifestVersion: input.manifestVersion,
    manifestHash: String(input.manifestHash),
    chainId: 8453,
    from: address(input.from, "Sender"),
    to: address(input.to, "Target"),
    value: 0,
    data: input.data.toLowerCase() as Hex,
  };
};

export const authenticateGatewayToken = (
  supplied: string | undefined,
  expected: string,
): boolean => {
  if (!supplied?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(supplied.slice(7));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
};

const manifestRule = (call: DecodedAllowedCall) => {
  const rule = BASE_DEPLOYMENT_MANIFEST.allowedCalls.find(
    (candidate) => candidate.id === call.callId,
  );
  if (!rule)
    throw new OlasGatewayError(
      "MANIFEST_RULE_MISSING",
      "Call rule is missing",
      500,
    );
  const contract = BASE_DEPLOYMENT_MANIFEST.contracts.find(
    (candidate) => candidate.id === rule.contractId,
  );
  if (!contract)
    throw new OlasGatewayError(
      "MANIFEST_TARGET_MISSING",
      "Call target is missing",
      500,
    );
  return { rule, contract };
};

const callArguments = (call: DecodedAllowedCall): readonly unknown[] => {
  if (call.callId === "USDC_APPROVE")
    return [call.arguments.spender, call.arguments.amount];
  if (call.callId === "OLAS_REQUEST")
    return [
      call.arguments.requestData,
      call.arguments.maxDeliveryRate,
      call.arguments.paymentType,
      call.arguments.priorityMech,
      call.arguments.responseTimeout,
      call.arguments.paymentData,
    ];
  return [
    call.arguments.asset,
    call.arguments.amount,
    call.arguments.onBehalfOf,
    call.arguments.referralCode,
  ];
};

const executionPolicy = (
  call: DecodedAllowedCall,
  approvedMaximumAmount: string,
): SafeExecutionPolicy => {
  const { rule, contract } = manifestRule(call);
  return {
    contractCalls: [
      {
        chainId: 8453,
        target: contract.address,
        functionName: rule.abi[0]!.name,
        functionSelector: rule.selector,
        maxNativeValueWei: "0",
        amountArgumentIndex: 1,
        maxAmountBaseUnits: approvedMaximumAmount,
        ...(call.callId === "USDC_APPROVE"
          ? { tokenAddress: contract.address, tokenLocation: "target" as const }
          : {}),
      },
    ],
    protocolActions: [],
  };
};

const safeCall = (
  input: OlasGatewayInput,
  decoded: DecodedAllowedCall,
): SafeContractCall => {
  const { rule, contract } = manifestRule(decoded);
  return {
    taskId: `synesis:${input.economicIntentId}:olas:${input.mechAddress}:${decoded.callId.toLowerCase()}`,
    chainId: 8453,
    contractAddress: contract.address,
    functionName: rule.abi[0]!.name,
    functionSelector: rule.selector,
    functionArgs: callArguments(decoded),
    abi: rule.abi as unknown as readonly Readonly<Record<string, unknown>>[],
    value: "0",
    ...(decoded.callId === "USDC_APPROVE"
      ? { tokenAddress: contract.address }
      : {}),
  };
};

export class OlasKeeperHubGateway {
  readonly #store: SynesisStore;
  readonly #directory: MechDirectoryReader;
  readonly #now: () => Date;
  readonly #createClients: OlasKeeperHubGatewayOptions["createClients"];

  public constructor(options: OlasKeeperHubGatewayOptions) {
    this.#store = options.store;
    this.#directory = options.mechDirectory;
    this.#now = options.now ?? (() => new Date());
    this.#createClients =
      options.createClients ??
      (async ({ organizationId, policy }) => {
        const credentials = await options.loadCredentials(organizationId);
        const keeperHub = new KeeperHubClient({
          apiKey: credentials.keeperHubApiKey,
          ...(options.keeperHubOrigin
            ? { apiOrigin: options.keeperHubOrigin }
            : {}),
          ...(options.fetch ? { fetch: options.fetch } : {}),
        });
        const wallet = await keeperHub.getWallet();
        const execution = new SafeExecutionClient({
          apiKey: credentials.keeperHubApiKey,
          policy,
          ...(options.keeperHubOrigin
            ? { apiOrigin: options.keeperHubOrigin }
            : {}),
          ...(options.fetch ? { fetch: options.fetch } : {}),
        });
        return {
          walletAddress: wallet.walletAddress.toLowerCase() as Address,
          execution,
          receipt: new ReceiptVerificationClient({
            executionClient: execution,
            rpcUrl: credentials.baseRpcUrl,
            ...(options.fetch ? { fetch: options.fetch } : {}),
          }),
        };
      });
  }

  public async submit(
    raw: unknown,
    traceId: string,
  ): Promise<OlasGatewayReceipt> {
    const input = parseOlasGatewayInput(raw);
    if (
      input.manifestVersion !== BASE_DEPLOYMENT_MANIFEST.manifestVersion ||
      input.manifestHash !== BASE_DEPLOYMENT_MANIFEST.contentHash
    ) {
      throw new OlasGatewayError(
        "MANIFEST_MISMATCH",
        "The Olas plan uses a stale manifest",
        409,
      );
    }
    const intent = await this.#store.read.intents.findById(
      input.economicIntentId,
    );
    if (
      !intent ||
      !["PROCUREMENT_READY", "PROCUREMENT_EXECUTING"].includes(intent.state)
    )
      throw new OlasGatewayError(
        "INTENT_NOT_READY",
        "Intent is not approved for procurement",
        409,
      );
    const intentMech =
      await this.#store.read.intentMechs.findByIntentAndMechAddress(
        intent.id,
        input.mechAddress,
      );
    if (!intentMech)
      throw new OlasGatewayError(
        "MECH_NOT_SELECTED",
        "Mech is not frozen into this intent",
        403,
      );
    if (BigInt(input.approvedMaximumAmount) !== BigInt(intentMech.quotedPrice))
      throw new OlasGatewayError(
        "APPROVAL_MISMATCH",
        "Approved maximum differs from the frozen quote",
        409,
      );
    const directory = await this.#directory.read();
    if (
      !directory.mechs.some(
        (mech) => mech.eligible && mech.address === input.mechAddress,
      )
    )
      throw new OlasGatewayError(
        "MECH_NOT_ELIGIBLE",
        "Mech is no longer eligible",
        409,
      );
    const decoded = validateCalldata({
      chainId: input.chainId,
      target: input.to,
      data: input.data,
      nativeValueWei: String(input.value),
      allowedPriorityMechs: [input.mechAddress],
    });
    if (
      decoded.callId === "OLAS_REQUEST" &&
      BigInt(decoded.arguments.maxDeliveryRate) >
        BigInt(input.approvedMaximumAmount)
    )
      throw new OlasGatewayError(
        "SPEND_EXCEEDS_APPROVAL",
        "Request exceeds the approved maximum",
      );
    if (
      decoded.callId === "USDC_APPROVE" &&
      BigInt(decoded.arguments.amount) !== BigInt(input.approvedMaximumAmount)
    )
      throw new OlasGatewayError(
        "APPROVAL_NOT_EXACT",
        "USDC approval must equal the frozen maximum",
      );
    if (decoded.callId === "AAVE_SUPPLY")
      throw new OlasGatewayError(
        "WRONG_GATEWAY_PURPOSE",
        "Olas gateway cannot execute Aave supply",
      );

    const policy = executionPolicy(decoded, input.approvedMaximumAmount);
    const clients = await this.#createClients!({
      organizationId: intent.organizationId,
      policy,
    });
    if (clients.walletAddress !== input.from)
      throw new OlasGatewayError(
        "WALLET_MISMATCH",
        "Call sender is not the KeeperHub organization wallet",
        403,
      );
    const call = safeCall(input, decoded);
    const identity = { requestId: randomUUID(), traceId };
    const simulation = await clients.execution.simulateContractCall(
      call,
      identity,
    );
    if (!simulation.approvedForBroadcast)
      throw new OlasGatewayError(
        "SIMULATION_REJECTED",
        "KeeperHub simulation rejected the call",
        409,
      );
    const prepared = prepareContractCall(call, policy);
    const purpose = `${decoded.callId}:${input.mechAddress}`;
    const reservation = await this.#store.transaction((repositories) =>
      repositories.keeperHubExecutions.reserve({
        id: randomUUID(),
        intentId: intent.id,
        purpose,
        idempotencyKey: prepared.idempotencyKey,
        simulationHash: simulation.payloadHash,
      }),
    );
    if (reservation.execution.simulationHash !== simulation.payloadHash)
      throw new OlasGatewayError(
        "SIMULATION_DRIFT",
        "Reserved simulation differs from this call",
        409,
      );

    let executionId = reservation.execution.executionId;
    let expectedTransactionHash: Hex | undefined;
    if (reservation.created) {
      const broadcast = await clients.execution.broadcastContractCall(
        call,
        simulation,
        identity,
      );
      const candidateId = broadcast.response.executionId;
      const candidateHash = broadcast.response.transactionHash;
      if (typeof candidateId !== "string" || !candidateId)
        throw new OlasGatewayError(
          "EXECUTION_ID_MISSING",
          "KeeperHub did not return an execution ID",
          502,
        );
      executionId = candidateId;
      expectedTransactionHash =
        typeof candidateHash === "string" && txPattern.test(candidateHash)
          ? (candidateHash.toLowerCase() as Hex)
          : undefined;
      await this.#store.transaction((repositories) =>
        repositories.keeperHubExecutions.attachExecution({
          id: reservation.execution.id,
          executionId: candidateId,
          status: "broadcast",
        }),
      );
    } else if (!executionId) {
      throw new OlasGatewayError(
        "EXECUTION_AMBIGUOUS",
        "A prior broadcast may exist; reconcile the reservation without rebroadcasting",
        409,
      );
    }

    const verified = await clients.receipt.reconcile({
      executionId,
      payloadHash: prepared.payloadHash,
      idempotencyKey: prepared.idempotencyKey,
      identity,
      expectedChainId: 8453,
      ...(expectedTransactionHash ? { expectedTransactionHash } : {}),
      deadlineAt: new Date(this.#now().getTime() + 300_000).toISOString(),
    });
    if (
      verified.classification !== "VERIFIED_SUCCESS" ||
      !verified.transactionHash ||
      !verified.receipt
    ) {
      await this.#store.transaction((repositories) =>
        repositories.keeperHubExecutions.markStatus({
          id: reservation.execution.id,
          status: verified.classification.toLowerCase(),
        }),
      );
      throw new OlasGatewayError(
        verified.nextAction === "RECONCILE_SAME_EXECUTION"
          ? "RECEIPT_UNCONFIRMED"
          : "RECEIPT_REJECTED",
        verified.reason,
        verified.nextAction === "RECONCILE_SAME_EXECUTION" ? 409 : 502,
      );
    }
    const requestId =
      decoded.callId === "OLAS_REQUEST"
        ? extractMarketplaceRequestId({
            logs: verified.receipt.logs,
            expectedMech: input.mechAddress,
            expectedRequester: input.from,
          })
        : undefined;
    if (!reservation.execution.economicSuccess) {
      await this.#store.transaction(async (repositories) => {
        await repositories.keeperHubExecutions.markEconomicSuccess({
          id: reservation.execution.id,
          executionId,
        });
        await repositories.transactionReceipts.create({
          id: randomUUID(),
          keeperHubExecutionId: reservation.execution.id,
          transactionHash: verified.transactionHash,
          blockNumber: Number(BigInt(verified.receipt!.blockNumber)),
          status: "success",
          verified: true,
          rawReceiptHash: verified.rpcReceiptHash!,
          observedAt: verified.observedAt,
        });
        if (requestId) {
          await repositories.olasRequests.reserve({
            id: randomUUID(),
            intentMechId: intentMech.id,
            chainId: 8453,
            requestId,
            keeperHubExecutionId: reservation.execution.id,
            transactionHash: verified.transactionHash,
            state: "submitted",
          });
        }
      });
    }
    return {
      executionId,
      transactionHash: verified.transactionHash,
      verified: true,
      receiptStatus: "success",
      ...(requestId ? { requestId } : {}),
    };
  }
}
