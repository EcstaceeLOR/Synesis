export interface LogContext {
  readonly traceId: string;
  readonly intentId?: string;
  readonly executionId?: string;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

const sensitiveKey =
  /api.?key|authorization|cookie|credential|password|private.?key|secret|token/iu;

export const redactLogValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactLogValue);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : redactLogValue(child),
      ]),
    );
  return value;
};

export const structuredLog = (input: {
  readonly level: LogLevel;
  readonly event: string;
  readonly context: LogContext;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly occurredAt?: string;
}): string =>
  JSON.stringify({
    timestamp: input.occurredAt ?? new Date().toISOString(),
    level: input.level,
    event: input.event,
    ...input.context,
    ...(input.details ? { details: redactLogValue(input.details) } : {}),
  });

const metricName = /^[a-z][a-z0-9_]*$/u;

export class MetricsRegistry {
  readonly #values = new Map<string, number>();

  public increment(
    name: string,
    labels: Readonly<Record<string, string>> = {},
    amount = 1,
  ): void {
    if (!metricName.test(name) || !Number.isFinite(amount))
      throw new TypeError("Metric is invalid");
    const key = `${name}${JSON.stringify(Object.entries(labels).sort())}`;
    this.#values.set(key, (this.#values.get(key) ?? 0) + amount);
  }

  public gauge(
    name: string,
    value: number,
    labels: Readonly<Record<string, string>> = {},
  ): void {
    if (!metricName.test(name) || !Number.isFinite(value))
      throw new TypeError("Metric is invalid");
    const key = `${name}${JSON.stringify(Object.entries(labels).sort())}`;
    this.#values.set(key, value);
  }

  public render(): string {
    return (
      [...this.#values.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => {
          const bracket = key.indexOf("[");
          const name = key.slice(0, bracket);
          const labels = JSON.parse(key.slice(bracket)) as [string, string][];
          const rendered = labels.length
            ? `{${labels.map(([label, item]) => `${label}="${item.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")}}`
            : "";
          return `${name}${rendered} ${value}`;
        })
        .join("\n") + "\n"
    );
  }
}

export type OperationalAlertCode =
  | "INTEGRATION_DEGRADED"
  | "INTENT_STUCK"
  | "UNEXPECTED_CALL"
  | "WRITE_UNCONFIRMED"
  | "LOW_BALANCE"
  | "PROOF_MISMATCH";

export const evaluateOperationalAlerts = (input: {
  readonly dependencyFailures: number;
  readonly stuckIntents: number;
  readonly unexpectedCalls: number;
  readonly unconfirmedWrites: number;
  readonly treasuryBalance: bigint;
  readonly minimumTreasuryBalance: bigint;
  readonly proofMismatches: number;
}): readonly OperationalAlertCode[] => [
  ...(input.dependencyFailures > 0 ? ["INTEGRATION_DEGRADED" as const] : []),
  ...(input.stuckIntents > 0 ? ["INTENT_STUCK" as const] : []),
  ...(input.unexpectedCalls > 0 ? ["UNEXPECTED_CALL" as const] : []),
  ...(input.unconfirmedWrites > 0 ? ["WRITE_UNCONFIRMED" as const] : []),
  ...(input.treasuryBalance < input.minimumTreasuryBalance
    ? ["LOW_BALANCE" as const]
    : []),
  ...(input.proofMismatches > 0 ? ["PROOF_MISMATCH" as const] : []),
];

export const dependencyHealth = (
  checks: readonly {
    readonly name: string;
    readonly healthy: boolean;
    readonly critical: boolean;
  }[],
) => ({
  status: checks.some((check) => check.critical && !check.healthy)
    ? ("down" as const)
    : checks.some((check) => !check.healthy)
      ? ("degraded" as const)
      : ("ok" as const),
  checks,
});
