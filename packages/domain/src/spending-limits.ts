export interface SpendingLimitPolicy {
  readonly maxPerIntent: bigint;
  readonly maxDaily: bigint;
  readonly maxStrategyExposure: bigint;
  readonly approvalThreshold: bigint;
}

export interface SpendingLimitSnapshot {
  readonly intentAmount: bigint;
  readonly dailyCommitted: bigint;
  readonly strategyCommitted: bigint;
  readonly approved: boolean;
}

export const evaluateSpendingLimits = (
  policy: SpendingLimitPolicy,
  snapshot: SpendingLimitSnapshot,
): {
  readonly allowed: boolean;
  readonly approvalRequired: boolean;
  readonly reasons: readonly string[];
} => {
  const reasons: string[] = [];
  if (snapshot.intentAmount > policy.maxPerIntent)
    reasons.push("PER_INTENT_LIMIT");
  if (snapshot.dailyCommitted + snapshot.intentAmount > policy.maxDaily)
    reasons.push("DAILY_LIMIT");
  if (
    snapshot.strategyCommitted + snapshot.intentAmount >
    policy.maxStrategyExposure
  )
    reasons.push("STRATEGY_EXPOSURE_LIMIT");
  const approvalRequired = snapshot.intentAmount >= policy.approvalThreshold;
  if (approvalRequired && !snapshot.approved) reasons.push("APPROVER_REQUIRED");
  return { allowed: reasons.length === 0, approvalRequired, reasons };
};
