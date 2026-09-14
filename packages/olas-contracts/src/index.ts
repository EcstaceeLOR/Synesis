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
