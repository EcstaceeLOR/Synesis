import {
  hashCanonicalJson,
  recommendationSchema,
  type Recommendation,
} from "@synesis/domain";

export class DeliveryValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DeliveryValidationError";
  }
}

/** Validate an untrusted IPFS result before it can enter quorum or execution. */
export async function validateOlasDeliveryResult(input: {
  readonly value: unknown;
  readonly expectedRequestId: string;
  readonly expectedMech: string;
  readonly expectedContentHash?: string;
  readonly maxBytes?: number;
}): Promise<Recommendation> {
  if (
    typeof input.value !== "object" ||
    input.value === null ||
    Array.isArray(input.value)
  )
    throw new DeliveryValidationError("Delivery result must be a JSON object");
  const result = recommendationSchema.safeParse(input.value);
  if (!result.success)
    throw new DeliveryValidationError(
      "Delivery result does not match the pinned recommendation schema",
    );
  const recommendation = result.data;
  if (
    recommendation.requestId.toLowerCase() !==
    input.expectedRequestId.toLowerCase()
  )
    throw new DeliveryValidationError(
      "Delivery result is bound to a different request",
    );
  if (
    recommendation.mechAddress.toLowerCase() !==
    input.expectedMech.toLowerCase()
  )
    throw new DeliveryValidationError(
      "Delivery result is bound to a different Mech",
    );
  const contentHash = await hashCanonicalJson({
    ...recommendation,
    contentHash: undefined,
  });
  if (
    input.expectedContentHash &&
    recommendation.contentHash !== input.expectedContentHash
  )
    throw new DeliveryValidationError(
      "Delivery content hash does not match the receipt",
    );
  if (recommendation.contentHash !== contentHash)
    throw new DeliveryValidationError("Delivery content hash is invalid");
  if (Date.parse(recommendation.validUntil) < Date.now())
    throw new DeliveryValidationError("Delivery recommendation is stale");
  if (JSON.stringify(recommendation).length > (input.maxBytes ?? 262_144))
    throw new DeliveryValidationError("Delivery result exceeds the size limit");
  return recommendation;
}
