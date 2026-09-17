import type { IntegrationHealth } from "./types";

export const createDemoIntegrationHealth = (): IntegrationHealth => {
  const checkedAt = new Date().toISOString();
  const check = (component: string, message: string, durationMs: number) => ({
    component,
    status: "ready" as const,
    message,
    details: { mode: "demo", valueMovement: false },
    durationMs,
    checkedAt,
  });
  return {
    organizationId: "synesis-demo",
    readiness: "READY",
    readyAt: checkedAt,
    wallet: {
      address: "0x83a0000000000000000000000000000000000c19",
      ethBalanceWei: "14200000000000000",
      usdcBalance: "14230180000",
      blockNumber: 35_902_184,
    },
    checks: [
      check(
        "keeperhub_credentials",
        "Scoped demo boundary active; live credentials remain server-only.",
        18,
      ),
      check(
        "keeperhub_wallet",
        "Organization wallet shape and Base chain binding verified.",
        27,
      ),
      check("base_support", "Base mainnet route 8453 is allowlisted.", 13),
      check("base_rpc", "Read-only Base probe passed.", 42),
      check("wallet_balances", "ETH and USDC demo snapshots are readable.", 31),
      check("olas_deployments", "Versioned Olas Base manifest loaded.", 24),
      check(
        "mech_compatibility",
        "Two independent compatible Mechs available.",
        56,
      ),
      check("ipfs", "Content-addressed delivery probe passed.", 47),
      check(
        "delivery_webhook",
        "Signed no-write webhook challenge passed.",
        35,
      ),
      check("session", "Owner demo session has the required capabilities.", 4),
    ],
  };
};
