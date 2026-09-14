import Fastify, { type FastifyInstance } from "fastify";
import { createServiceHealth, environmentSchema } from "@synesis/domain";

export function buildServer(): FastifyInstance {
  const server = Fastify({ logger: process.env.NODE_ENV !== "test" });

  server.get("/health", () =>
    createServiceHealth(
      "api",
      environmentSchema.catch("demo").parse(process.env.SYNESIS_MODE),
      "0.1.0",
    ),
  );

  return server;
}
