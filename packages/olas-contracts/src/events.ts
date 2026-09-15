import { bytesToHex } from "@noble/hashes/utils.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

import {
  BASE_DEPLOYMENT_MANIFEST,
  type Address,
  type Hex,
} from "./manifest.js";

export const MARKETPLACE_REQUEST_TOPIC = `0x${bytesToHex(
  keccak_256(
    new TextEncoder().encode(
      "MarketplaceRequest(address,address,uint256,bytes32[],bytes[])",
    ),
  ),
)}` as Hex;

export interface MarketplaceReceiptLog {
  readonly address: Address;
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

const fail = (message: string): never => {
  throw new TypeError(message);
};

const normalizeAddress = (value: string, label: string): Address => {
  if (!/^0x[\da-f]{40}$/iu.test(value)) fail(`${label} is not an EVM address`);
  return value.toLowerCase() as Address;
};

const topicAddress = (value: string, label: string): Address => {
  if (!/^0x[\da-f]{64}$/iu.test(value)) fail(`${label} topic is malformed`);
  if (!/^0x0{24}/iu.test(value)) fail(`${label} topic padding is non-zero`);
  return normalizeAddress(`0x${value.slice(-40)}`, label);
};

const word = (data: string, byteOffset: number): string => {
  const start = 2 + byteOffset * 2;
  const value = data.slice(start, start + 64);
  if (value.length !== 64) fail("MarketplaceRequest event data is truncated");
  return value;
};

const unsigned = (value: string, label: string): number => {
  const parsed = BigInt(`0x${value}`);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) fail(`${label} is too large`);
  return Number(parsed);
};

export const extractMarketplaceRequestId = (input: {
  readonly logs: readonly MarketplaceReceiptLog[];
  readonly expectedMech: Address;
  readonly expectedRequester: Address;
  readonly marketplaceAddress?: Address;
}): Hex => {
  const marketplace = normalizeAddress(
    input.marketplaceAddress ??
      BASE_DEPLOYMENT_MANIFEST.contracts.find(
        (contract) => contract.id === "OLAS_MARKETPLACE",
      )?.address ??
      fail("Olas marketplace is absent from the deployment manifest"),
    "Marketplace",
  );
  const expectedMech = normalizeAddress(input.expectedMech, "Expected Mech");
  const expectedRequester = normalizeAddress(
    input.expectedRequester,
    "Expected requester",
  );
  const matching = input.logs.filter(
    (log) =>
      normalizeAddress(log.address, "Log address") === marketplace &&
      log.topics[0]?.toLowerCase() === MARKETPLACE_REQUEST_TOPIC &&
      topicAddress(log.topics[1] ?? "", "priorityMech") === expectedMech &&
      topicAddress(log.topics[2] ?? "", "requester") === expectedRequester,
  );
  if (matching.length !== 1)
    fail(
      "Exactly one requester- and Mech-bound MarketplaceRequest event is required",
    );
  const event = matching[0]!;
  if (!/^0x[\da-f]*$/iu.test(event.data))
    fail("MarketplaceRequest event data is malformed");
  const count = unsigned(word(event.data, 0), "Request count");
  const requestIdsOffset = unsigned(word(event.data, 32), "Request ID offset");
  if (requestIdsOffset < 96 || requestIdsOffset % 32 !== 0)
    fail("Request ID array offset is non-canonical");
  const idsLength = unsigned(
    word(event.data, requestIdsOffset),
    "Request ID count",
  );
  if (count !== 1 || idsLength !== 1)
    fail("A single-Mech procurement must emit exactly one request ID");
  const requestId = word(event.data, requestIdsOffset + 32).toLowerCase();
  if (/^0+$/u.test(requestId)) fail("Olas request ID cannot be zero");
  return `0x${requestId}`;
};
