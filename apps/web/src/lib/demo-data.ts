import type { MechDirectory } from "@synesis/domain";

const observedAt = "2026-09-17T09:00:00.000Z";
const schemaHash = (character: string) => `sha256:${character.repeat(64)}`;

export const demoMechDirectory: MechDirectory = {
  chainId: 8453,
  status: "ready",
  source: "olas-mech-client",
  observedAt,
  observedVersion: "demo-snapshot-2026-09-17",
  mechs: [
    {
      chainId: 8453,
      address: "0x21a091b000000000000000000000000000000001",
      serviceId: 218,
      factoryAddress: "0x1000000000000000000000000000000000000001",
      name: "Gaia Risk Mech",
      description: "Independent market and protocol risk analysis.",
      metadataCid: "bafybeigaia-risk-mech-demo",
      paymentType: "native",
      unitAmount: 6_200_000,
      paymentDecimals: 6,
      totalDeliveries: 1284,
      health: "active",
      eligible: true,
      compatibilityScore: 99,
      reasons: [],
      tools: [
        {
          name: "risk-analysis/v3",
          description: "Structured Base and Aave risk recommendation.",
          inputSchema: { type: "object", required: ["asset", "amount"] },
          outputSchema: {
            type: "object",
            required: ["action", "confidenceBps", "riskScore"],
          },
          schemaHash: schemaHash("a"),
        },
      ],
      observedAt,
      observedVersion: "olas-base-2026.09",
    },
    {
      chainId: 8453,
      address: "0xa8b1100000000000000000000000000000000002",
      serviceId: 431,
      factoryAddress: "0x1000000000000000000000000000000000000001",
      name: "Valory DeFi Analyst",
      description: "Yield quality and liquidity analysis for DeFi positions.",
      metadataCid: "bafybeivalory-defi-demo",
      paymentType: "native",
      unitAmount: 5_900_000,
      paymentDecimals: 6,
      totalDeliveries: 954,
      health: "active",
      eligible: true,
      compatibilityScore: 97,
      reasons: [],
      tools: [
        {
          name: "yield-review/v2",
          description: "Structured yield sustainability recommendation.",
          inputSchema: { type: "object", required: ["protocol", "asset"] },
          outputSchema: {
            type: "object",
            required: ["action", "confidenceBps", "riskScore"],
          },
          schemaHash: schemaHash("b"),
        },
      ],
      observedAt,
      observedVersion: "olas-base-2026.09",
    },
    {
      chainId: 8453,
      address: "0xf3c4200000000000000000000000000000000003",
      serviceId: 577,
      factoryAddress: "0x1000000000000000000000000000000000000001",
      name: "Sentinel Markets",
      description: "Market anomaly detection with an outdated output schema.",
      metadataCid: "bafybeisentinel-markets-demo",
      paymentType: "native",
      unitAmount: 6_500_000,
      paymentDecimals: 6,
      totalDeliveries: 721,
      health: "degraded",
      eligible: false,
      compatibilityScore: 62,
      reasons: [
        {
          code: "SCHEMA_DRIFT",
          message: "The current tool omits the required expiry field.",
        },
      ],
      tools: [
        {
          name: "market-risk/v1",
          description: "Legacy market-risk response.",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
          schemaHash: schemaHash("c"),
        },
      ],
      observedAt,
      observedVersion: "olas-base-2026.09",
    },
  ],
};

export const demoActivity = [
  {
    id: "evt-proof",
    time: "12:04:18",
    label: "Proof bundle PRF-1041 sealed",
    status: "VERIFIED",
    href: "/verify/PRF-1041",
  },
  {
    id: "evt-receipt",
    time: "12:03:51",
    label: "KeeperHub receipt KH-8831 confirmed",
    status: "FINAL",
    href: "/app/executions/KH-8831",
  },
  {
    id: "evt-quorum",
    time: "12:02:07",
    label: "Deterministic quorum reached 2 / 2",
    status: "PASSED",
    href: "/app/intents/SYN-1041",
  },
  {
    id: "evt-olas",
    time: "11:59:42",
    label: "Two Olas deliveries normalized",
    status: "READY",
    href: "/app/mechs",
  },
] as const;
