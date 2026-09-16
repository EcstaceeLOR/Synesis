import { z } from "zod";

import {
  proofBundleSchema,
  proofEvidenceEntrySchema,
  type ProofBundle,
} from "./contracts.js";
import { canonicalJson, hashCanonicalJson } from "./hashing.js";

const forbiddenKeys =
  /^(apiKey|authorization|cookie|email|encryptedSecretRef|organizationId|privateKey|secret|token)$/iu;

const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !forbiddenKeys.test(key))
        .map(([key, child]) => [key, redact(child)]),
    );
  return value;
};

const publicEntrySchema = proofEvidenceEntrySchema.extend({
  payload: z.json(),
});

export const publicProofBundleSchema = z
  .object({
    ...proofBundleSchema.shape,
    entries: z.array(publicEntrySchema).min(1),
  })
  .strict()
  .superRefine((bundle, context) => {
    bundle.entries.forEach((entry, index) => {
      if (entry.position !== index)
        context.addIssue({
          code: "custom",
          path: ["entries", index, "position"],
          message: "Proof evidence positions must be contiguous and zero-based",
        });
    });
  });

export type PublicProofBundle = z.infer<typeof publicProofBundleSchema>;

export async function createPublicProofBundle(input: {
  readonly id: string;
  readonly publicId: string;
  readonly intentId: string;
  readonly traceId: string;
  readonly createdAt: string;
  readonly artifacts: readonly {
    readonly kind: z.infer<typeof proofEvidenceEntrySchema>["kind"];
    readonly label: string;
    readonly payload: unknown;
    readonly publicReference?: string | null;
    readonly recordedAt: string;
  }[];
}): Promise<PublicProofBundle> {
  const entries = await Promise.all(
    input.artifacts.map(async (artifact, position) => {
      const payload = redact(artifact.payload);
      return {
        position,
        kind: artifact.kind,
        label: artifact.label,
        payload,
        contentHash: await hashCanonicalJson(payload),
        publicReference: artifact.publicReference ?? null,
        recordedAt: artifact.recordedAt,
      };
    }),
  );
  const rootHash = await hashCanonicalJson(
    entries.map(({ position, kind, contentHash }) => ({
      position,
      kind,
      contentHash,
    })),
  );
  return publicProofBundleSchema.parse({
    schemaVersion: "1.0",
    id: input.id,
    publicId: input.publicId,
    intentId: input.intentId,
    traceId: input.traceId,
    entries,
    rootHash,
    createdAt: input.createdAt,
  });
}

export async function verifyPublicProofBundle(value: unknown): Promise<{
  readonly valid: boolean;
  readonly bundle: PublicProofBundle;
  readonly invalidPositions: readonly number[];
}> {
  const bundle = publicProofBundleSchema.parse(value);
  const hashes = await Promise.all(
    bundle.entries.map((entry) => hashCanonicalJson(entry.payload)),
  );
  const invalidPositions = bundle.entries
    .filter((entry, index) => hashes[index] !== entry.contentHash)
    .map((entry) => entry.position);
  const rootHash = await hashCanonicalJson(
    bundle.entries.map(({ position, kind }, index) => ({
      position,
      kind,
      contentHash: hashes[index],
    })),
  );
  return {
    valid: invalidPositions.length === 0 && rootHash === bundle.rootHash,
    bundle,
    invalidPositions,
  };
}

export const serializePublicProofBundle = (bundle: PublicProofBundle): string =>
  canonicalJson(bundle);

export const asPrivateProofBundle = (bundle: PublicProofBundle): ProofBundle =>
  proofBundleSchema.parse({
    ...bundle,
    entries: bundle.entries.map((entry) => ({
      position: entry.position,
      kind: entry.kind,
      label: entry.label,
      contentHash: entry.contentHash,
      publicReference: entry.publicReference,
      recordedAt: entry.recordedAt,
    })),
  });
