import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export interface AbiInput {
  readonly name: string;
  readonly type: string;
}

export interface AbiFunction {
  readonly type: "function";
  readonly name: string;
  readonly stateMutability: "nonpayable" | "payable" | "view" | "pure";
  readonly inputs: readonly AbiInput[];
  readonly outputs: readonly AbiInput[];
}

export interface ProxiedExpectation {
  readonly kind: "CALL" | "EIP1967";
  readonly implementation: Address;
  readonly implementationCodeSha256: string;
  readonly resolver?: Hex;
  readonly storageSlot?: Hex;
}

export interface DirectExpectation {
  readonly kind: "NONE";
}

export type ProxyExpectation = ProxiedExpectation | DirectExpectation;

export interface ContractDeployment {
  readonly id:
    "OLAS_MARKETPLACE" | "OLAS_USDC_BALANCE_TRACKER" | "USDC" | "AAVE_POOL";
  readonly address: Address;
  readonly runtimeCodeSha256: string;
  readonly proxy: ProxyExpectation;
}

export type CallConstraint =
  | {
      readonly kind: "OLAS_REQUEST_USDC";
      readonly maxDeliveryRateBaseUnits: string;
      readonly paymentType: Hex;
      readonly minResponseTimeoutSeconds: number;
      readonly maxResponseTimeoutSeconds: number;
      readonly maxRequestBytes: number;
    }
  | {
      readonly kind: "USDC_APPROVE_AAVE";
      readonly spender: Address;
      readonly maxAmountBaseUnits: string;
    }
  | {
      readonly kind: "USDC_APPROVE_BOUNDED_SPENDERS";
      readonly spenders: readonly {
        readonly address: Address;
        readonly purpose: "OLAS_PAYMENT" | "AAVE_SUPPLY";
        readonly maxAmountBaseUnits: string;
      }[];
    }
  | {
      readonly kind: "AAVE_SUPPLY_USDC";
      readonly asset: Address;
      readonly maxAmountBaseUnits: string;
      readonly referralCode: number;
    };

export interface AllowedCall {
  readonly id: "OLAS_REQUEST" | "USDC_APPROVE" | "AAVE_SUPPLY";
  readonly contractId: ContractDeployment["id"];
  readonly signature: string;
  readonly selector: Hex;
  readonly abi: readonly AbiFunction[];
  readonly maxNativeValueWei: string;
  readonly constraint: CallConstraint;
}

export interface DeploymentManifestContent {
  readonly schemaVersion: "1.0";
  readonly manifestVersion: string;
  readonly chain: { readonly id: 8453; readonly name: "Base mainnet" };
  readonly createdAt: string;
  readonly sources: {
    readonly olasMechClientRevision: string;
    readonly olasMarketplaceRevision: string;
    readonly aaveAddressBookRevision: string;
  };
  readonly contracts: readonly ContractDeployment[];
  readonly allowedCalls: readonly AllowedCall[];
}

export interface VersionedDeploymentManifest extends DeploymentManifestContent {
  readonly contentHash: string;
}

export interface DeploymentManifest {
  readonly chainId: 8453;
  readonly version: string;
  readonly contracts: Readonly<Record<string, Address>>;
}

export interface ManifestReference {
  readonly manifestVersion: string;
  readonly contentHash: string;
}

export interface ManifestUpdateAuditEvent {
  readonly action: "deployment_manifest.version_created";
  readonly actorId: string;
  readonly reason: string;
  readonly previousManifestHash: string;
  readonly nextManifestHash: string;
  readonly occurredAt: string;
}

export class DeploymentManifestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DeploymentManifestError";
  }
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
};

export const canonicalManifestJson = (value: unknown): string =>
  JSON.stringify(canonicalize(value));

export const hashManifestContent = (
  content: DeploymentManifestContent,
): string =>
  `sha256:${bytesToHex(
    sha256(new TextEncoder().encode(canonicalManifestJson(content))),
  )}`;

export const selectorForSignature = (signature: string): Hex =>
  `0x${bytesToHex(keccak_256(new TextEncoder().encode(signature))).slice(0, 8)}`;

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const addressPattern = /^0x[\da-f]{40}$/iu;
const hashPattern = /^sha256:[\da-f]{64}$/u;

const validateContent = (content: DeploymentManifestContent): void => {
  if (content.chain.id !== 8453) {
    throw new DeploymentManifestError(
      "Only Base mainnet manifests are supported",
    );
  }
  if (
    !content.manifestVersion.trim() ||
    !Number.isFinite(Date.parse(content.createdAt))
  ) {
    throw new DeploymentManifestError(
      "Manifest version or creation time is invalid",
    );
  }
  const contractIds = new Set<string>();
  const addresses = new Set<string>();
  for (const contract of content.contracts) {
    const address = contract.address.toLowerCase();
    if (
      !addressPattern.test(address) ||
      !hashPattern.test(contract.runtimeCodeSha256)
    ) {
      throw new DeploymentManifestError(
        `Deployment ${contract.id} is malformed`,
      );
    }
    if (contractIds.has(contract.id) || addresses.has(address)) {
      throw new DeploymentManifestError(
        "Contract IDs and addresses must be unique",
      );
    }
    contractIds.add(contract.id);
    addresses.add(address);
    if (contract.proxy.kind === "NONE") continue;
    if (
      !addressPattern.test(contract.proxy.implementation) ||
      !hashPattern.test(contract.proxy.implementationCodeSha256)
    )
      throw new DeploymentManifestError(
        `${contract.id} proxy expectation is malformed`,
      );
    if (
      contract.proxy.kind === "CALL" &&
      !contract.proxy.resolver?.match(/^0x[\da-f]{8}$/iu)
    ) {
      throw new DeploymentManifestError(
        `${contract.id} proxy resolver is missing`,
      );
    }
    if (
      contract.proxy.kind === "EIP1967" &&
      !contract.proxy.storageSlot?.match(/^0x[\da-f]{64}$/iu)
    ) {
      throw new DeploymentManifestError(`${contract.id} proxy slot is missing`);
    }
  }
  const callKeys = new Set<string>();
  for (const call of content.allowedCalls) {
    if (!contractIds.has(call.contractId)) {
      throw new DeploymentManifestError(
        `${call.id} references an unknown contract`,
      );
    }
    if (selectorForSignature(call.signature) !== call.selector.toLowerCase()) {
      throw new DeploymentManifestError(
        `${call.id} selector does not match its signature`,
      );
    }
    const matchingAbi = call.abi.filter(
      (entry) =>
        `${entry.name}(${entry.inputs.map((input) => input.type).join(",")})` ===
        call.signature,
    );
    if (matchingAbi.length !== 1) {
      throw new DeploymentManifestError(
        `${call.id} ABI must contain one exact function`,
      );
    }
    if (call.constraint.kind === "USDC_APPROVE_BOUNDED_SPENDERS") {
      const spenders = new Set<string>();
      for (const bound of call.constraint.spenders) {
        const address = bound.address.toLowerCase();
        if (
          !addressPattern.test(address) ||
          !/^\d+$/u.test(bound.maxAmountBaseUnits) ||
          BigInt(bound.maxAmountBaseUnits) <= 0n ||
          spenders.has(address)
        ) {
          throw new DeploymentManifestError(
            "USDC spender bounds must be unique, positive, and well formed",
          );
        }
        spenders.add(address);
      }
      if (spenders.size === 0) {
        throw new DeploymentManifestError(
          "USDC spender bounds cannot be empty",
        );
      }
    }
    const key = `${call.contractId}:${call.selector.toLowerCase()}`;
    if (callKeys.has(key)) {
      throw new DeploymentManifestError("Ambiguous target and selector pair");
    }
    callKeys.add(key);
  }
};

export const createVersionedManifest = (
  content: DeploymentManifestContent,
): VersionedDeploymentManifest => {
  validateContent(content);
  return deepFreeze({ ...content, contentHash: hashManifestContent(content) });
};

export const referenceManifest = (
  manifest: VersionedDeploymentManifest,
): ManifestReference => ({
  manifestVersion: manifest.manifestVersion,
  contentHash: manifest.contentHash,
});

export const assertManifestReference = (
  manifest: VersionedDeploymentManifest,
  reference: ManifestReference,
): void => {
  const { contentHash: _contentHash, ...content } = manifest;
  void _contentHash;
  if (
    reference.manifestVersion !== manifest.manifestVersion ||
    reference.contentHash !== manifest.contentHash ||
    hashManifestContent(content) !== reference.contentHash
  ) {
    throw new DeploymentManifestError(
      "Intent manifest reference does not match immutable content",
    );
  }
};

export const createManifestUpdate = (input: {
  readonly previous: VersionedDeploymentManifest;
  readonly next: DeploymentManifestContent;
  readonly actorId: string;
  readonly reason: string;
  readonly occurredAt: string;
}): {
  readonly manifest: VersionedDeploymentManifest;
  readonly auditEvent: ManifestUpdateAuditEvent;
} => {
  if (input.next.manifestVersion === input.previous.manifestVersion) {
    throw new DeploymentManifestError(
      "Deployment changes require a new manifest version",
    );
  }
  if (!input.actorId.trim() || !input.reason.trim()) {
    throw new DeploymentManifestError(
      "Manifest updates require an actor and reason",
    );
  }
  if (!Number.isFinite(Date.parse(input.occurredAt))) {
    throw new DeploymentManifestError("Manifest audit timestamp is invalid");
  }
  const manifest = createVersionedManifest(input.next);
  return {
    manifest,
    auditEvent: deepFreeze({
      action: "deployment_manifest.version_created",
      actorId: input.actorId,
      reason: input.reason,
      previousManifestHash: input.previous.contentHash,
      nextManifestHash: manifest.contentHash,
      occurredAt: input.occurredAt,
    }),
  };
};

const functionAbi = (
  name: string,
  stateMutability: AbiFunction["stateMutability"],
  inputs: readonly AbiInput[],
): readonly AbiFunction[] => [
  { type: "function", name, stateMutability, inputs, outputs: [] },
];

const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

const manifestContentV1 = {
  schemaVersion: "1.0",
  manifestVersion: "base-2026-09-15.1",
  chain: { id: 8453, name: "Base mainnet" },
  createdAt: "2026-09-15T00:00:00.000Z",
  sources: {
    olasMechClientRevision: "9ec7368bd391e14fbf7e80185eabd0c3e90af698",
    olasMarketplaceRevision: "6878a291a3bf9f3607bd295f5f7034007505672e",
    aaveAddressBookRevision: "fdaecf26c96398e6a9b54c2b6477647fba293a91",
  },
  contracts: [
    {
      id: "OLAS_MARKETPLACE",
      address: "0xf24ee42eda0fc9b33b7d41b06ee8ccd2ef7c5020",
      runtimeCodeSha256:
        "sha256:1833f73532aee9c742d2a7fb0c584cbc1daaf2b36d2b0d8261a2f8287a1ead1d",
      proxy: {
        kind: "CALL",
        implementation: "0x155547857680a6d51bebc5603397488988deb1c8",
        implementationCodeSha256:
          "sha256:50383c3b69cc6fe6dd46745ad1669aa4ef31ecafd8036df01df5609ac8abab8b",
        resolver: "0xaaf10f42",
      },
    },
    {
      id: "USDC",
      address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      runtimeCodeSha256:
        "sha256:98d785fcb1bf847f287adc2310759fd94cc13e754b974bc72131382e8266f607",
      proxy: {
        kind: "CALL",
        implementation: "0x2ce6311ddae708829bc0784c967b7d77d19fd779",
        implementationCodeSha256:
          "sha256:dcb3b7ca28662970d0a7cdad420e529fb837d7bf8a246b1a680c20e153db79e8",
        resolver: "0x5c60da1b",
      },
    },
    {
      id: "AAVE_POOL",
      address: "0xa238dd80c259a72e81d7e4664a9801593f98d1c5",
      runtimeCodeSha256:
        "sha256:0ce3fd0250aff7584b77df0ac1f3de5a7a732e842d0dd8d67e73836d2c07b685",
      proxy: {
        kind: "EIP1967",
        implementation: "0xa4abc5fcba6d0d7e3d144d6dbf6cb6128599dfdb",
        implementationCodeSha256:
          "sha256:107cf122b17722d846e4859ddf98aac581852b4f27ac4506c77d389b62f5621f",
        storageSlot: EIP1967_IMPLEMENTATION_SLOT,
      },
    },
  ],
  allowedCalls: [
    {
      id: "OLAS_REQUEST",
      contractId: "OLAS_MARKETPLACE",
      signature: "request(bytes,uint256,bytes32,address,uint256,bytes)",
      selector: "0xf6938b09",
      abi: functionAbi("request", "payable", [
        { name: "requestData", type: "bytes" },
        { name: "maxDeliveryRate", type: "uint256" },
        { name: "paymentType", type: "bytes32" },
        { name: "priorityMech", type: "address" },
        { name: "responseTimeout", type: "uint256" },
        { name: "paymentData", type: "bytes" },
      ]),
      maxNativeValueWei: "0",
      constraint: {
        kind: "OLAS_REQUEST_USDC",
        maxDeliveryRateBaseUnits: "1000000",
        paymentType:
          "0x6406bb5f31a732f898e1ce9fdd988a80a808d36ab5d9a4a4805a8be8d197d5e3",
        minResponseTimeoutSeconds: 60,
        maxResponseTimeoutSeconds: 300,
        maxRequestBytes: 8192,
      },
    },
    {
      id: "USDC_APPROVE",
      contractId: "USDC",
      signature: "approve(address,uint256)",
      selector: "0x095ea7b3",
      abi: functionAbi("approve", "nonpayable", [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ]),
      maxNativeValueWei: "0",
      constraint: {
        kind: "USDC_APPROVE_AAVE",
        spender: "0xa238dd80c259a72e81d7e4664a9801593f98d1c5",
        maxAmountBaseUnits: "10000000000",
      },
    },
    {
      id: "AAVE_SUPPLY",
      contractId: "AAVE_POOL",
      signature: "supply(address,uint256,address,uint16)",
      selector: "0x617ba037",
      abi: functionAbi("supply", "nonpayable", [
        { name: "asset", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "onBehalfOf", type: "address" },
        { name: "referralCode", type: "uint16" },
      ]),
      maxNativeValueWei: "0",
      constraint: {
        kind: "AAVE_SUPPLY_USDC",
        asset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        maxAmountBaseUnits: "10000000000",
        referralCode: 0,
      },
    },
  ],
} as const satisfies DeploymentManifestContent;

export const BASE_DEPLOYMENT_MANIFEST_V1 =
  createVersionedManifest(manifestContentV1);

const manifestContentV2 = {
  ...manifestContentV1,
  manifestVersion: "base-2026-09-15.2",
  createdAt: "2026-09-15T02:30:00.000Z",
  sources: {
    ...manifestContentV1.sources,
    olasMechClientRevision: "28115ed8e88aa4bbbdde709ff14fdc63e63cef37",
  },
  contracts: [
    ...manifestContentV1.contracts,
    {
      id: "OLAS_USDC_BALANCE_TRACKER",
      address: "0x0443c55e151dba13fae079518f9dd01ff9c21cb2",
      runtimeCodeSha256:
        "sha256:953ecd1c06d4f50e0ffe60c79ce0ce999237f0d8812f07fd10df5aae5d0e6834",
      proxy: { kind: "NONE" },
    },
  ],
  allowedCalls: manifestContentV1.allowedCalls.map((call) =>
    call.id === "USDC_APPROVE"
      ? {
          ...call,
          constraint: {
            kind: "USDC_APPROVE_BOUNDED_SPENDERS" as const,
            spenders: [
              {
                address: "0x0443c55e151dba13fae079518f9dd01ff9c21cb2" as const,
                purpose: "OLAS_PAYMENT" as const,
                maxAmountBaseUnits: "1000000",
              },
              {
                address: "0xa238dd80c259a72e81d7e4664a9801593f98d1c5" as const,
                purpose: "AAVE_SUPPLY" as const,
                maxAmountBaseUnits: "10000000000",
              },
            ],
          },
        }
      : call,
  ),
} as const satisfies DeploymentManifestContent;

const baseManifestUpdate = createManifestUpdate({
  previous: BASE_DEPLOYMENT_MANIFEST_V1,
  next: manifestContentV2,
  actorId: "synesis:issue-12",
  reason:
    "Pin the official Olas USDC payment tracker used by mech-client 0.22.0",
  occurredAt: manifestContentV2.createdAt,
});

export const BASE_DEPLOYMENT_MANIFEST = baseManifestUpdate.manifest;
export const BASE_DEPLOYMENT_MANIFEST_UPDATE_AUDIT_EVENT =
  baseManifestUpdate.auditEvent;

export const EMPTY_BASE_MANIFEST: DeploymentManifest = {
  chainId: 8453,
  version: "unconfigured",
  contracts: {},
};

/** Compatibility view used by integration onboarding. */
export const BASE_MECH_MARKETPLACE: DeploymentManifest = {
  chainId: 8453,
  version: BASE_DEPLOYMENT_MANIFEST.manifestVersion,
  contracts: {
    mechMarketplace: BASE_DEPLOYMENT_MANIFEST.contracts[0]?.address ?? "0x",
    complementaryMetadata: "0x28c1edc7ced549f7f80b732fdc19f0370160707d",
    usdc: BASE_DEPLOYMENT_MANIFEST.contracts[1]?.address ?? "0x",
    fixedPriceNativeFactory: "0x2e008211f34b25a7d7c102403c6c2c3b665a1abe",
    fixedPriceTokenFactory: "0x97371b1c0cda1d04dfc43dfb50a04645b7bc9bee",
    nvmNativeFactory: "0x847bbe8b474e0820215f818858e23f5f5591855a",
    nvmUsdcFactory: "0x7bed01f8482ff686f025628e7780ca6c1f0559fc",
  },
};

export const OLAS_BASE_SUBGRAPH =
  "https://api.subgraph.autonolas.tech/api/proxy/marketplace-base";
