export interface DeploymentManifest {
  readonly chainId: 8453;
  readonly version: string;
  readonly contracts: Readonly<Record<string, `0x${string}`>>;
}

export const EMPTY_BASE_MANIFEST: DeploymentManifest = {
  chainId: 8453,
  version: "unconfigured",
  contracts: {},
};

/** Live Base addresses published by the official valory-xyz/mech-client. */
export const BASE_MECH_MARKETPLACE: DeploymentManifest = {
  chainId: 8453,
  version: "mech-client/main",
  contracts: {
    mechMarketplace: "0xf24eE42edA0fc9b33B7D41B06Ee8ccD2Ef7C5020",
    complementaryMetadata: "0x28C1edC7CEd549F7f80B732fDC19f0370160707d",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    fixedPriceNativeFactory: "0x2E008211f34b25A7d7c102403c6C2C3B665a1abe",
    fixedPriceTokenFactory: "0x97371B1C0cDA1D04dFc43DFb50a04645b7Bc9BEe",
    nvmNativeFactory: "0x847bBE8b474e0820215f818858e23F5f5591855A",
    nvmUsdcFactory: "0x7beD01f8482fF686F025628e7780ca6C1f0559fc",
  },
};

export const OLAS_BASE_SUBGRAPH =
  "https://api.subgraph.autonolas.tech/api/proxy/marketplace-base";
