import { z } from "zod";

export const environmentSchema = z.enum(["demo", "live"]);

export const serviceHealthSchema = z.object({
  service: z.string().min(1),
  status: z.enum(["ok", "degraded", "down"]),
  environment: environmentSchema,
  checkedAt: z.string().datetime(),
  version: z.string().min(1),
});

export type Environment = z.infer<typeof environmentSchema>;
export type ServiceHealth = z.infer<typeof serviceHealthSchema>;

export const createServiceHealth = (
  service: string,
  environment: Environment,
  version: string,
): ServiceHealth =>
  serviceHealthSchema.parse({
    service,
    status: "ok",
    environment,
    checkedAt: new Date().toISOString(),
    version,
  });
