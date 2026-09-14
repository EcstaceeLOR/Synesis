export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}

export const denyByDefault = (reason: string): PolicyDecision => ({
  allowed: false,
  reasons: [reason],
});
