import { hashCanonicalJson } from "./hashing.js";
import {
  policyEvaluationSchema,
  recommendationSchema,
  type PolicyEvaluation,
} from "./contracts.js";

export interface QuorumPolicy {
  readonly minimumConfidenceBps: number;
  readonly maximumRiskScore: number;
  readonly maximumRiskDivergence: number;
  readonly maximumAmountBaseUnits: string;
  readonly freshnessWindowSeconds: number;
}

export interface QuorumInput {
  readonly intentId: string;
  readonly policyVersionId: string;
  readonly policy: QuorumPolicy;
  readonly requestId: string;
  readonly amountBaseUnits: string;
  readonly recommendations: readonly unknown[];
  readonly evaluatedAt?: string;
}

const rule = (
  ruleId: string,
  passed: boolean,
  reason: string,
  actual?: unknown,
  expected?: unknown,
) => ({
  ruleId,
  passed,
  reason,
  ...(actual === undefined ? {} : { actual }),
  ...(expected === undefined ? {} : { expected }),
});

export async function evaluateRecommendationQuorum(
  input: QuorumInput,
): Promise<PolicyEvaluation> {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const parsed = input.recommendations.map((value) =>
    recommendationSchema.safeParse(value),
  );
  const recommendations = parsed.flatMap((result) =>
    result.success ? [result.data] : [],
  );
  const validShape = recommendations.length === input.recommendations.length;
  const mechs = new Set(
    recommendations.map((recommendation) =>
      recommendation.mechAddress.toLowerCase(),
    ),
  );
  const now = Date.parse(evaluatedAt);
  const rules = [
    rule(
      "distinct_mechs",
      validShape && mechs.size === recommendations.length,
      "Recommendations must come from distinct Mechs",
      [...mechs],
      "distinct",
    ),
    rule(
      "request_match",
      validShape &&
        recommendations.every(
          (recommendation) => recommendation.requestId === input.requestId,
        ),
      "Every recommendation must match the paid request",
      recommendations.map((recommendation) => recommendation.requestId),
      input.requestId,
    ),
    rule(
      "chain_asset",
      validShape &&
        recommendations.every(
          (recommendation) =>
            recommendation.chainId === 8453 && recommendation.asset === "USDC",
        ),
      "All recommendations must target Base USDC",
      recommendations.map(
        (recommendation) => `${recommendation.chainId}:${recommendation.asset}`,
      ),
      "8453:USDC",
    ),
    rule(
      "supply_agreement",
      validShape &&
        recommendations.length >= 2 &&
        recommendations.every(
          (recommendation) => recommendation.action === "SUPPLY",
        ),
      "All independent Mechs must agree on SUPPLY",
      recommendations.map((recommendation) => recommendation.action),
      "SUPPLY",
    ),
    rule(
      "confidence_floor",
      validShape &&
        recommendations.every(
          (recommendation) =>
            recommendation.confidenceBps >= input.policy.minimumConfidenceBps,
        ),
      "Every confidence score must clear the policy floor",
      recommendations.map((recommendation) => recommendation.confidenceBps),
      input.policy.minimumConfidenceBps,
    ),
    rule(
      "risk_ceiling",
      validShape &&
        recommendations.every(
          (recommendation) =>
            recommendation.riskScore <= input.policy.maximumRiskScore,
        ),
      "Every risk score must be within the policy ceiling",
      recommendations.map((recommendation) => recommendation.riskScore),
      input.policy.maximumRiskScore,
    ),
    rule(
      "risk_divergence",
      validShape &&
        recommendations.length > 0 &&
        Math.max(
          ...recommendations.map((recommendation) => recommendation.riskScore),
        ) -
          Math.min(
            ...recommendations.map(
              (recommendation) => recommendation.riskScore,
            ),
          ) <=
          input.policy.maximumRiskDivergence,
      "Independent risk scores must not diverge beyond policy",
      recommendations.map((recommendation) => recommendation.riskScore),
      input.policy.maximumRiskDivergence,
    ),
    rule(
      "freshness",
      validShape &&
        recommendations.every(
          (recommendation) =>
            Date.parse(recommendation.validUntil) >= now &&
            now - Date.parse(recommendation.receivedAt) <=
              input.policy.freshnessWindowSeconds * 1000,
        ),
      "Recommendations must be fresh at evaluation time",
      recommendations.map((recommendation) => recommendation.validUntil),
      evaluatedAt,
    ),
    rule(
      "amount_cap",
      /^[1-9]\d*$/u.test(input.amountBaseUnits) &&
        BigInt(input.amountBaseUnits) <=
          BigInt(input.policy.maximumAmountBaseUnits),
      "Intent amount must be within the immutable policy cap",
      input.amountBaseUnits,
      input.policy.maximumAmountBaseUnits,
    ),
  ];
  const result = rules.every((candidate) => candidate.passed)
    ? "PASSED"
    : "REJECTED";
  const inputHash = await hashCanonicalJson({ ...input, recommendations });
  const outputHash = await hashCanonicalJson({ result, rules });
  return policyEvaluationSchema.parse({
    schemaVersion: "1.0",
    id: `evaluation-${input.intentId}-${input.policyVersionId}`,
    intentId: input.intentId,
    policyVersionId: input.policyVersionId,
    inputHash,
    result,
    rules,
    outputHash,
    evaluatedAt,
  });
}
