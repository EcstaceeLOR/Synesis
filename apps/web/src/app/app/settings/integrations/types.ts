export type HealthStatus = "ready" | "failed" | "unconfigured";
export interface IntegrationCheck {
  readonly component: string;
  readonly status: HealthStatus;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly durationMs: number;
  readonly checkedAt: string;
}
export interface IntegrationHealth {
  readonly organizationId: string;
  readonly readiness: "NOT_READY" | "READY";
  readonly readyAt: string | null;
  readonly wallet: null | {
    readonly address: string;
    readonly ethBalanceWei: string;
    readonly usdcBalance: string;
    readonly blockNumber: number;
  };
  readonly checks: readonly IntegrationCheck[];
}
export interface IntegrationActionState {
  readonly status: "idle" | "success" | "error";
  readonly message?: string;
  readonly health: IntegrationHealth;
}
