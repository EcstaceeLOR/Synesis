import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { canonicalJson } from "@synesis/domain";
import type { SynesisStore } from "@synesis/database";

export interface OlasDeliveryWebhookPayload {
  readonly type: "olas.delivery";
  readonly requestId: string;
  readonly deliveryReference: string;
  readonly block: number;
  readonly transactionHash: `0x${string}`;
  readonly timestamp: string;
  readonly nonce: string;
  readonly body: unknown;
}

export class DeliveryWebhookError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 422,
  ) {
    super(message);
    this.name = "DeliveryWebhookError";
  }
}

const txHash = /^0x[\da-f]{64}$/iu;
const nonce = /^[\da-f]{16,128}$/iu;

export const verifyDeliverySignature = (
  body: string,
  supplied: string | undefined,
  secret: string,
): boolean => {
  if (!supplied?.startsWith("sha256=")) return false;
  const actual = Buffer.from(supplied.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(body).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const parseDeliveryWebhook = (
  value: unknown,
): OlasDeliveryWebhookPayload => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new DeliveryWebhookError(
      "INVALID_DELIVERY",
      "Delivery body must be an object",
    );
  const input = value as Record<string, unknown>;
  if (
    input.type !== "olas.delivery" ||
    typeof input.requestId !== "string" ||
    input.requestId.length < 1 ||
    typeof input.deliveryReference !== "string" ||
    input.deliveryReference.length < 1 ||
    typeof input.block !== "number" ||
    !Number.isSafeInteger(input.block) ||
    input.block < 0 ||
    typeof input.transactionHash !== "string" ||
    !txHash.test(input.transactionHash) ||
    typeof input.timestamp !== "string" ||
    Number.isNaN(Date.parse(input.timestamp)) ||
    typeof input.nonce !== "string" ||
    !nonce.test(input.nonce) ||
    !("body" in input)
  )
    throw new DeliveryWebhookError(
      "INVALID_DELIVERY",
      "Delivery body is malformed",
    );
  return {
    type: "olas.delivery",
    requestId: input.requestId,
    deliveryReference: input.deliveryReference,
    block: input.block,
    transactionHash: input.transactionHash.toLowerCase() as `0x${string}`,
    timestamp: input.timestamp,
    nonce: input.nonce.toLowerCase(),
    body: input.body,
  };
};

export async function acceptOlasDelivery(input: {
  readonly store: SynesisStore;
  readonly payload: OlasDeliveryWebhookPayload;
  readonly signature: string | undefined;
  readonly secret: string;
  readonly rawBody?: string;
  readonly now?: Date;
}): Promise<{ readonly accepted: boolean; readonly eventKey: string }> {
  const raw = input.rawBody ?? canonicalJson(input.payload);
  if (!verifyDeliverySignature(raw, input.signature, input.secret))
    throw new DeliveryWebhookError(
      "INVALID_SIGNATURE",
      "Delivery signature is invalid",
      401,
    );
  const age = Math.abs(
    (input.now ?? new Date()).getTime() - Date.parse(input.payload.timestamp),
  );
  if (age > 300_000)
    throw new DeliveryWebhookError(
      "DELIVERY_EXPIRED",
      "Delivery signature is expired",
      409,
    );
  const eventKey = `8453:${input.payload.requestId}:${input.payload.deliveryReference}`;
  const accepted = await input.store.transaction((repositories) =>
    repositories.events.accept({
      id: randomUUID(),
      source: "olas-webhook",
      eventKey,
      payloadHash: `sha256:${createHmac("sha256", "synesis-event").update(raw).digest("hex")}`,
    }),
  );
  return { accepted, eventKey };
}
