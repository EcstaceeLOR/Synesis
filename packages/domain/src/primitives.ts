import { z } from "zod";

export const BASE_CHAIN_ID = 8453 as const;

export const baseChainIdSchema = z.literal(BASE_CHAIN_ID);
export const entityIdSchema = z.string().trim().min(1).max(128);
export const traceIdSchema = z.string().trim().min(1).max(128);
export const isoTimestampSchema = z.string().datetime({ offset: true });
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const transactionHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const positiveBaseUnitsSchema = z.string().regex(/^[1-9]\d*$/);
export const nonNegativeBaseUnitsSchema = z.string().regex(/^\d+$/);
export const basisPointsSchema = z.number().int().min(0).max(10_000);
export const riskScoreSchema = z.number().int().min(0).max(100);
export const cidSchema = z.string().trim().min(1).max(256);

export const actorSchema = z
  .object({
    type: z.enum(["USER", "SYSTEM", "WORKER", "RECONCILER"]),
    id: entityIdSchema,
  })
  .strict();

export type Actor = z.infer<typeof actorSchema>;
