import { z } from "zod";

import { hashCanonicalJson } from "./hashing.js";
import {
  addressSchema,
  baseChainIdSchema,
  contentHashSchema,
  isoTimestampSchema,
} from "./primitives.js";

export const mechCompatibilityReasonSchema = z
  .object({ code: z.string().min(1), message: z.string().min(1) })
  .strict();

export const mechToolSnapshotSchema = z
  .object({
    name: z.string().min(1).max(128),
    description: z.string().max(2_000),
    inputSchema: z.record(z.string(), z.unknown()),
    outputSchema: z.record(z.string(), z.unknown()),
    schemaHash: contentHashSchema,
  })
  .strict();

export const discoveredMechSchema = z
  .object({
    chainId: baseChainIdSchema,
    address: addressSchema,
    serviceId: z.number().int().positive(),
    factoryAddress: addressSchema.nullable(),
    name: z.string().min(1),
    description: z.string(),
    metadataCid: z.string().min(1).nullable(),
    paymentType: z.string().min(1).nullable(),
    unitAmount: z.number().int().nonnegative().nullable(),
    paymentDecimals: z.number().int().min(0).max(18),
    totalDeliveries: z.number().int().nonnegative(),
    health: z.enum(["active", "degraded", "inactive"]),
    eligible: z.boolean(),
    compatibilityScore: z.number().int().min(0).max(100),
    reasons: z.array(mechCompatibilityReasonSchema),
    tools: z.array(mechToolSnapshotSchema),
    observedAt: isoTimestampSchema,
    observedVersion: z.string().min(1),
  })
  .strict();

export const mechDirectorySchema = z
  .object({
    chainId: baseChainIdSchema,
    status: z.enum(["ready", "degraded", "empty"]),
    source: z.literal("olas-mech-client"),
    observedAt: isoTimestampSchema,
    observedVersion: z.string().min(1),
    mechs: z.array(discoveredMechSchema),
  })
  .strict();

const adapterToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  input_schema: z.record(z.string(), z.unknown()),
  output_schema: z.record(z.string(), z.unknown()),
  schema_hash: contentHashSchema,
});

const adapterMechSchema = z.object({
  chain_id: z.literal(8453),
  address: addressSchema,
  service_id: z.number().int().positive(),
  factory_address: addressSchema.nullable(),
  name: z.string(),
  description: z.string(),
  metadata_cid: z.string().nullable(),
  payment_type: z.string().nullable(),
  unit_amount: z.number().int().nonnegative().nullable(),
  payment_decimals: z.number().int().min(0).max(18),
  total_deliveries: z.number().int().nonnegative(),
  health: z.enum(["active", "degraded", "inactive"]),
  eligible: z.boolean(),
  compatibility_score: z.number().int().min(0).max(100),
  reasons: z.array(mechCompatibilityReasonSchema),
  tools: z.array(adapterToolSchema),
  observed_at: isoTimestampSchema,
  observed_version: z.string(),
});

export const olasAdapterDirectorySchema = z
  .object({
    chain_id: z.literal(8453),
    status: z.enum(["ready", "degraded", "empty"]),
    source: z.literal("olas-mech-client"),
    observed_at: isoTimestampSchema,
    observed_version: z.string(),
    mechs: z.array(adapterMechSchema),
  })
  .transform((directory) =>
    mechDirectorySchema.parse({
      chainId: directory.chain_id,
      status: directory.status,
      source: directory.source,
      observedAt: directory.observed_at,
      observedVersion: directory.observed_version,
      mechs: directory.mechs.map((mech) => ({
        chainId: mech.chain_id,
        address: mech.address,
        serviceId: mech.service_id,
        factoryAddress: mech.factory_address,
        name: mech.name,
        description: mech.description,
        metadataCid: mech.metadata_cid,
        paymentType: mech.payment_type,
        unitAmount: mech.unit_amount,
        paymentDecimals: mech.payment_decimals,
        totalDeliveries: mech.total_deliveries,
        health: mech.health,
        eligible: mech.eligible,
        compatibilityScore: mech.compatibility_score,
        reasons: mech.reasons,
        tools: mech.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.input_schema,
          outputSchema: tool.output_schema,
          schemaHash: tool.schema_hash,
        })),
        observedAt: mech.observed_at,
        observedVersion: mech.observed_version,
      })),
    }),
  );

export const mechSelectionSchema = z
  .object({ mechAddress: addressSchema, tool: z.string().min(1).max(128) })
  .strict();

export const frozenMechSelectionSchema = z
  .object({
    mechAddress: addressSchema,
    serviceId: z.number().int().positive(),
    metadataCid: z.string().min(1),
    tool: z.string().min(1),
    toolSchemaHash: contentHashSchema,
    observedVersion: z.string().min(1),
    observedAt: isoTimestampSchema,
  })
  .strict();

export const frozenMechSelectionBundleSchema = z
  .object({
    schemaVersion: z.literal("synesis.mech-selection.v1"),
    chainId: baseChainIdSchema,
    snapshotHash: contentHashSchema,
    selections: z.array(frozenMechSelectionSchema).length(2),
  })
  .strict();

export type DiscoveredMech = z.infer<typeof discoveredMechSchema>;
export type MechDirectory = z.infer<typeof mechDirectorySchema>;
export type MechSelection = z.infer<typeof mechSelectionSchema>;
export type FrozenMechSelectionBundle = z.infer<
  typeof frozenMechSelectionBundleSchema
>;

export async function freezeMechSelections(
  directoryInput: unknown,
  selectionsInput: unknown,
): Promise<FrozenMechSelectionBundle> {
  const directory = mechDirectorySchema.parse(directoryInput);
  const selections = z
    .array(mechSelectionSchema)
    .length(2)
    .parse(selectionsInput);
  if (
    selections[0]?.mechAddress.toLowerCase() ===
    selections[1]?.mechAddress.toLowerCase()
  ) {
    throw new TypeError("Selected Mechs must be independent");
  }
  const frozen = selections.map((selection) => {
    const mech = directory.mechs.find(
      (candidate) =>
        candidate.address.toLowerCase() === selection.mechAddress.toLowerCase(),
    );
    if (!mech?.eligible || !mech.metadataCid)
      throw new TypeError("Selected Mech is not eligible");
    const tool = mech.tools.find(
      (candidate) => candidate.name === selection.tool,
    );
    if (!tool) throw new TypeError("Selected tool schema is not eligible");
    return frozenMechSelectionSchema.parse({
      mechAddress: mech.address,
      serviceId: mech.serviceId,
      metadataCid: mech.metadataCid,
      tool: tool.name,
      toolSchemaHash: tool.schemaHash,
      observedVersion: mech.observedVersion,
      observedAt: mech.observedAt,
    });
  });
  const material = {
    schemaVersion: "synesis.mech-selection.v1" as const,
    chainId: directory.chainId,
    selections: frozen,
  };
  return frozenMechSelectionBundleSchema.parse({
    ...material,
    snapshotHash: await hashCanonicalJson(material),
  });
}
