import {
  BASE_DEPLOYMENT_MANIFEST,
  DeploymentManifestError,
  type Address,
  type AllowedCall,
  type CallConstraint,
  type Hex,
  type VersionedDeploymentManifest,
} from "./manifest.js";

export interface CalldataValidationInput {
  readonly chainId: number;
  readonly target: Address;
  readonly data: Hex;
  readonly nativeValueWei: string;
  readonly expectedWallet?: Address;
  readonly allowedPriorityMechs?: readonly Address[];
}

export type DecodedAllowedCall =
  | {
      readonly callId: "OLAS_REQUEST";
      readonly signature: string;
      readonly selector: Hex;
      readonly arguments: {
        readonly requestData: Hex;
        readonly maxDeliveryRate: string;
        readonly paymentType: Hex;
        readonly priorityMech: Address;
        readonly responseTimeout: number;
        readonly paymentData: Hex;
      };
    }
  | {
      readonly callId: "USDC_APPROVE";
      readonly signature: string;
      readonly selector: Hex;
      readonly arguments: {
        readonly spender: Address;
        readonly amount: string;
      };
    }
  | {
      readonly callId: "AAVE_SUPPLY";
      readonly signature: string;
      readonly selector: Hex;
      readonly arguments: {
        readonly asset: Address;
        readonly amount: string;
        readonly onBehalfOf: Address;
        readonly referralCode: number;
      };
    };

const calldataPattern = /^0x[\da-f]*$/iu;
const addressPattern = /^0x[\da-f]{40}$/iu;

const fail = (message: string): never => {
  throw new DeploymentManifestError(message);
};

const requireConstraint = <Kind extends CallConstraint["kind"]>(
  constraint: CallConstraint,
  kind: Kind,
): Extract<CallConstraint, { readonly kind: Kind }> => {
  if (constraint.kind !== kind) fail(`Expected ${kind} constraint`);
  return constraint as Extract<CallConstraint, { readonly kind: Kind }>;
};

const normalizeAddress = (value: string, label: string): Address => {
  if (!addressPattern.test(value)) fail(`${label} is not an EVM address`);
  return value.toLowerCase() as Address;
};

const normalizeUnsigned = (value: string, label: string): bigint => {
  if (!/^\d+$/u.test(value)) fail(`${label} must be an unsigned integer`);
  return BigInt(value);
};

const wordAt = (payload: string, index: number): string => {
  const start = index * 64;
  const word = payload.slice(start, start + 64);
  if (word.length !== 64) fail("Calldata head is truncated");
  return word;
};

const uintWord = (value: bigint): string => {
  if (value < 0n || value >= 1n << 256n) fail("ABI integer is out of range");
  return value.toString(16).padStart(64, "0");
};

const addressWord = (value: Address): string =>
  normalizeAddress(value, "ABI address").slice(2).padStart(64, "0");

const decodeAddressWord = (word: string, label: string): Address => {
  if (!/^0{24}/u.test(word)) fail(`${label} has non-zero address padding`);
  return normalizeAddress(`0x${word.slice(24)}`, label);
};

const decodeUintWord = (word: string): bigint => BigInt(`0x${word}`);

const bytesTail = (value: Hex): string => {
  const data = value.slice(2).toLowerCase();
  if (data.length % 2 !== 0 || !/^[\da-f]*$/u.test(data)) {
    fail("Dynamic bytes are malformed");
  }
  const padding = (64 - (data.length % 64)) % 64;
  return `${uintWord(BigInt(data.length / 2))}${data}${"0".repeat(padding)}`;
};

const decodeDynamicBytes = (
  payload: string,
  offsetWord: string,
  headBytes: number,
): Hex => {
  const offset = decodeUintWord(offsetWord);
  if (offset > BigInt(Number.MAX_SAFE_INTEGER))
    fail("Dynamic offset is too large");
  const offsetNumber = Number(offset);
  if (offsetNumber < headBytes || offsetNumber % 32 !== 0) {
    fail("Dynamic offset is non-canonical");
  }
  const lengthPosition = offsetNumber * 2;
  const lengthWord = payload.slice(lengthPosition, lengthPosition + 64);
  if (lengthWord.length !== 64) fail("Dynamic length is truncated");
  const length = decodeUintWord(lengthWord);
  if (length > BigInt(Number.MAX_SAFE_INTEGER))
    fail("Dynamic value is too large");
  const dataStart = lengthPosition + 64;
  const dataEnd = dataStart + Number(length) * 2;
  const data = payload.slice(dataStart, dataEnd);
  if (data.length !== Number(length) * 2) fail("Dynamic value is truncated");
  return `0x${data}`;
};

const encodeOlasRequest = (arguments_: {
  readonly requestData: Hex;
  readonly maxDeliveryRate: string;
  readonly paymentType: Hex;
  readonly priorityMech: Address;
  readonly responseTimeout: number;
  readonly paymentData: Hex;
}): Hex => {
  const requestTail = bytesTail(arguments_.requestData);
  const paymentTail = bytesTail(arguments_.paymentData);
  const headBytes = 6 * 32;
  const head = [
    uintWord(BigInt(headBytes)),
    uintWord(BigInt(arguments_.maxDeliveryRate)),
    arguments_.paymentType.slice(2).toLowerCase().padStart(64, "0"),
    addressWord(arguments_.priorityMech),
    uintWord(BigInt(arguments_.responseTimeout)),
    uintWord(BigInt(headBytes + requestTail.length / 2)),
  ].join("");
  return `0xf6938b09${head}${requestTail}${paymentTail}`;
};

const encodeApprove = (spender: Address, amount: string): Hex =>
  `0x095ea7b3${addressWord(spender)}${uintWord(BigInt(amount))}`;

const encodeSupply = (arguments_: {
  readonly asset: Address;
  readonly amount: string;
  readonly onBehalfOf: Address;
  readonly referralCode: number;
}): Hex =>
  `0x617ba037${addressWord(arguments_.asset)}${uintWord(BigInt(arguments_.amount))}${addressWord(arguments_.onBehalfOf)}${uintWord(BigInt(arguments_.referralCode))}`;

const contractForTarget = (
  manifest: VersionedDeploymentManifest,
  target: Address,
) => {
  const normalized = normalizeAddress(target, "Call target");
  const matches = manifest.contracts.filter(
    (contract) => contract.address.toLowerCase() === normalized,
  );
  if (matches.length !== 1) fail("Call target is not uniquely allowlisted");
  return matches[0];
};

const ruleForSelector = (
  manifest: VersionedDeploymentManifest,
  contractId: string,
  selector: string,
): AllowedCall => {
  const matches = manifest.allowedCalls.filter(
    (call) =>
      call.contractId === contractId &&
      call.selector.toLowerCase() === selector.toLowerCase(),
  );
  if (matches.length !== 1) fail("Function selector is unknown or ambiguous");
  return matches[0] as AllowedCall;
};

const decodeOlas = (
  payload: string,
  rule: AllowedCall,
  input: CalldataValidationInput,
): DecodedAllowedCall => {
  if (payload.length < 6 * 64) fail("Olas request calldata is truncated");
  const paymentType: Hex = `0x${wordAt(payload, 2)}`;
  const arguments_ = {
    requestData: decodeDynamicBytes(payload, wordAt(payload, 0), 192),
    maxDeliveryRate: decodeUintWord(wordAt(payload, 1)).toString(),
    paymentType,
    priorityMech: decodeAddressWord(wordAt(payload, 3), "priorityMech"),
    responseTimeout: Number(decodeUintWord(wordAt(payload, 4))),
    paymentData: decodeDynamicBytes(payload, wordAt(payload, 5), 192),
  };
  const constraint = requireConstraint(rule.constraint, "OLAS_REQUEST_USDC");
  if (arguments_.requestData.length <= 2)
    fail("Olas request data cannot be empty");
  if ((arguments_.requestData.length - 2) / 2 > constraint.maxRequestBytes) {
    fail("Olas request data exceeds the manifest cap");
  }
  if (
    BigInt(arguments_.maxDeliveryRate) >
    BigInt(constraint.maxDeliveryRateBaseUnits)
  ) {
    fail("Olas delivery rate exceeds the manifest cap");
  }
  if (arguments_.paymentType !== constraint.paymentType.toLowerCase()) {
    fail("Olas payment type is not allowlisted");
  }
  if (
    !Number.isSafeInteger(arguments_.responseTimeout) ||
    arguments_.responseTimeout < constraint.minResponseTimeoutSeconds ||
    arguments_.responseTimeout > constraint.maxResponseTimeoutSeconds
  ) {
    fail("Olas response timeout is outside the manifest bounds");
  }
  if (arguments_.paymentData !== "0x")
    fail("Olas USDC payment data must be empty");
  const mechs = input.allowedPriorityMechs?.map((mech) =>
    normalizeAddress(mech, "Allowed priority Mech"),
  );
  if (!mechs?.includes(arguments_.priorityMech)) {
    fail("Priority Mech was not approved by compatibility discovery");
  }
  const canonical = encodeOlasRequest(arguments_);
  if (canonical.slice(10) !== payload) fail("Olas calldata is not canonical");
  return {
    callId: "OLAS_REQUEST",
    signature: rule.signature,
    selector: rule.selector,
    arguments: arguments_,
  };
};

export const validateCalldata = (
  input: CalldataValidationInput,
  manifest: VersionedDeploymentManifest = BASE_DEPLOYMENT_MANIFEST,
): DecodedAllowedCall => {
  if (input.chainId !== manifest.chain.id) fail("Chain ID is not allowlisted");
  if (
    !calldataPattern.test(input.data) ||
    input.data.length < 10 ||
    input.data.length % 2 !== 0
  ) {
    fail("Calldata is malformed");
  }
  const contract = contractForTarget(manifest, input.target);
  const selector = input.data.slice(0, 10).toLowerCase();
  const rule = ruleForSelector(manifest, contract?.id ?? "", selector);
  const value = normalizeUnsigned(input.nativeValueWei, "Native value");
  if (value > BigInt(rule.maxNativeValueWei))
    fail("Native value exceeds the manifest cap");
  const payload = input.data.slice(10).toLowerCase();

  if (rule.id === "OLAS_REQUEST") return decodeOlas(payload, rule, input);
  if (rule.id === "USDC_APPROVE") {
    if (payload.length !== 128)
      fail("USDC approve calldata has a non-canonical length");
    const spender = decodeAddressWord(wordAt(payload, 0), "USDC spender");
    const amount = decodeUintWord(wordAt(payload, 1)).toString();
    const constraint = requireConstraint(rule.constraint, "USDC_APPROVE_AAVE");
    if (spender !== constraint.spender.toLowerCase())
      fail("USDC spender is not Aave Pool");
    if (BigInt(amount) > BigInt(constraint.maxAmountBaseUnits)) {
      fail("USDC approval exceeds the manifest cap");
    }
    if (
      encodeApprove(spender, amount).toLowerCase() !== input.data.toLowerCase()
    ) {
      fail("USDC approval calldata is not canonical");
    }
    return {
      callId: "USDC_APPROVE",
      signature: rule.signature,
      selector: rule.selector,
      arguments: { spender, amount },
    };
  }

  if (payload.length !== 256)
    fail("Aave supply calldata has a non-canonical length");
  const asset = decodeAddressWord(wordAt(payload, 0), "Aave asset");
  const amount = decodeUintWord(wordAt(payload, 1)).toString();
  const onBehalfOf = decodeAddressWord(wordAt(payload, 2), "Aave beneficiary");
  const referral = decodeUintWord(wordAt(payload, 3));
  if (referral > 65_535n) fail("Aave referral code exceeds uint16");
  const referralCode = Number(referral);
  const constraint = requireConstraint(rule.constraint, "AAVE_SUPPLY_USDC");
  if (asset !== constraint.asset.toLowerCase())
    fail("Aave asset is not Base USDC");
  if (BigInt(amount) > BigInt(constraint.maxAmountBaseUnits)) {
    fail("Aave supply exceeds the manifest cap");
  }
  if (referralCode !== constraint.referralCode)
    fail("Aave referral code is not allowlisted");
  const expectedWallet = input.expectedWallet;
  if (!expectedWallet) {
    throw new DeploymentManifestError(
      "Expected KeeperHub wallet is required for Aave supply",
    );
  }
  if (onBehalfOf !== normalizeAddress(expectedWallet, "Expected wallet")) {
    fail("Aave beneficiary does not match the KeeperHub wallet");
  }
  const arguments_ = { asset, amount, onBehalfOf, referralCode };
  if (encodeSupply(arguments_).toLowerCase() !== input.data.toLowerCase()) {
    fail("Aave supply calldata is not canonical");
  }
  return {
    callId: "AAVE_SUPPLY",
    signature: rule.signature,
    selector: rule.selector,
    arguments: arguments_,
  };
};

export const encodeAllowedCall = (
  call:
    | {
        readonly callId: "USDC_APPROVE";
        readonly spender: Address;
        readonly amount: string;
      }
    | {
        readonly callId: "AAVE_SUPPLY";
        readonly asset: Address;
        readonly amount: string;
        readonly onBehalfOf: Address;
        readonly referralCode: number;
      }
    | {
        readonly callId: "OLAS_REQUEST";
        readonly requestData: Hex;
        readonly maxDeliveryRate: string;
        readonly paymentType: Hex;
        readonly priorityMech: Address;
        readonly responseTimeout: number;
        readonly paymentData: Hex;
      },
): Hex => {
  if (call.callId === "USDC_APPROVE")
    return encodeApprove(call.spender, call.amount);
  if (call.callId === "AAVE_SUPPLY") return encodeSupply(call);
  return encodeOlasRequest(call);
};
