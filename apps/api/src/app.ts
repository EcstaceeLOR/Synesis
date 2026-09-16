import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import {
  createServiceHealth,
  environmentSchema,
  serializePublicProofBundle,
  verifyPublicProofBundle,
} from "@synesis/domain";
import { createSynesisStore, type SynesisStore } from "@synesis/database";

import {
  createOidcIdentityVerifier,
  registerAuthRoutes,
  type IdentityVerifier,
} from "./auth.js";
import { EnvelopeEncryption, IntegrationService } from "./integrations.js";
import { OlasMechDirectoryClient, type MechDirectoryReader } from "./mechs.js";
import {
  authenticateGatewayToken,
  OlasGatewayError,
  OlasKeeperHubGateway,
} from "./olas-gateway.js";
import {
  acceptOlasDelivery,
  DeliveryWebhookError,
  parseDeliveryWebhook,
} from "./delivery-webhook.js";

export interface BuildServerOptions {
  readonly store?: SynesisStore;
  readonly identityVerifier?: IdentityVerifier;
  readonly allowedOrigins?: readonly string[];
  readonly secureCookies?: boolean;
  readonly now?: () => Date;
  readonly integrationService?: IntegrationService;
  readonly mechDirectory?: MechDirectoryReader;
  readonly olasGateway?: Pick<OlasKeeperHubGateway, "submit">;
  readonly internalServiceToken?: string;
  readonly deliveryWebhookSecret?: string;
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const server = Fastify({ logger: process.env.NODE_ENV !== "test" });
  const ownedStore =
    options.store === undefined && process.env.DATABASE_URL
      ? createSynesisStore({ connectionString: process.env.DATABASE_URL })
      : undefined;
  const store = options.store ?? ownedStore;
  const issuer = process.env.OIDC_ISSUER;
  const audience = process.env.OIDC_AUDIENCE;
  const jwksUrl = process.env.OIDC_JWKS_URL;
  const identityVerifier =
    options.identityVerifier ??
    (issuer && audience && jwksUrl
      ? createOidcIdentityVerifier({ issuer, audience, jwksUrl })
      : undefined);
  const allowedOrigins = new Set(
    options.allowedOrigins ??
      (process.env.SYNESIS_WEB_ORIGINS ?? "http://localhost:3000")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
  );
  const encryptionKey = process.env.SYNESIS_SECRET_ENCRYPTION_KEY;
  const integrationService =
    options.integrationService ??
    (store && encryptionKey
      ? new IntegrationService({
          store,
          encryption: new EnvelopeEncryption(encryptionKey),
          ...(options.now ? { now: options.now } : {}),
          ...(process.env.KEEPERHUB_API_ORIGIN
            ? { keeperHubOrigin: process.env.KEEPERHUB_API_ORIGIN }
            : {}),
          ...(process.env.IPFS_PROBE_CID
            ? { ipfsProbeCid: process.env.IPFS_PROBE_CID }
            : {}),
        })
      : undefined);
  const mechDirectory =
    options.mechDirectory ??
    (process.env.OLAS_ADAPTER_URL && process.env.OLAS_ADAPTER_INTERNAL_TOKEN
      ? new OlasMechDirectoryClient({
          origin: process.env.OLAS_ADAPTER_URL,
          token: process.env.OLAS_ADAPTER_INTERNAL_TOKEN,
        })
      : undefined);
  const olasGateway =
    options.olasGateway ??
    (store && integrationService && mechDirectory
      ? new OlasKeeperHubGateway({
          store,
          mechDirectory,
          loadCredentials: (organizationId) =>
            integrationService.loadExecutionCredentials(organizationId),
          ...(process.env.KEEPERHUB_API_ORIGIN
            ? { keeperHubOrigin: process.env.KEEPERHUB_API_ORIGIN }
            : {}),
          ...(options.now ? { now: options.now } : {}),
        })
      : undefined);
  const internalServiceToken =
    options.internalServiceToken ?? process.env.OLAS_ADAPTER_INTERNAL_TOKEN;
  const deliveryWebhookSecret =
    options.deliveryWebhookSecret ?? process.env.SYNESIS_OLAS_WEBHOOK_SECRET;

  server.register(cors, {
    origin: [...allowedOrigins],
    credentials: true,
    allowedHeaders: ["content-type", "x-csrf-token", "x-request-id"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  server.get("/health", () =>
    createServiceHealth(
      "api",
      environmentSchema.catch("demo").parse(process.env.SYNESIS_MODE),
      "0.1.0",
    ),
  );

  server.get<{
    Params: { publicId: string };
    Querystring: { download?: string };
  }>("/api/v1/proofs/:publicId", async (request, reply) => {
    if (!store)
      return reply.status(503).send({
        code: "PROOF_STORE_UNAVAILABLE",
        message: "Proof persistence is not configured",
      });
    const record = await store.read.proofBundles.findByPublicId(
      request.params.publicId,
    );
    if (!record)
      return reply.status(404).send({
        code: "PROOF_NOT_FOUND",
        message: "Public proof was not found",
      });
    try {
      const result = await verifyPublicProofBundle(record.canonicalBundle);
      if (!result.valid)
        return reply.status(409).send({
          code: "PROOF_TAMPERED",
          message: "Proof verification failed",
          invalidPositions: result.invalidPositions,
        });
      if (request.query.download === "1") {
        return reply
          .header(
            "content-disposition",
            `attachment; filename="${result.bundle.publicId}.json"`,
          )
          .type("application/json")
          .send(serializePublicProofBundle(result.bundle));
      }
      return { valid: true, bundle: result.bundle };
    } catch {
      return reply.status(409).send({
        code: "PROOF_INVALID",
        message: "Stored proof is malformed",
      });
    }
  });

  server.get("/api/v1/activity", () => ({
    events: [],
    source: "persisted-lifecycle",
    updatedAt: new Date().toISOString(),
  }));
  server.get("/api/v1/activity/stream", async (_request, reply) => {
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    reply.raw.write(
      `data: ${JSON.stringify({ message: "Synesis activity stream connected" })}\n\n`,
    );
    const heartbeat = setInterval(
      () => reply.raw.write(`: heartbeat ${Date.now()}\n\n`),
      15_000,
    );
    reply.raw.on("close", () => clearInterval(heartbeat));
    return reply;
  });

  server.post<{ Body: unknown }>(
    "/internal/v1/keeperhub/submit-call",
    async (request, reply) => {
      if (!olasGateway || !internalServiceToken)
        return reply.status(503).send({
          code: "OLAS_GATEWAY_UNCONFIGURED",
          message: "The internal Olas execution gateway is not configured",
        });
      if (
        !authenticateGatewayToken(
          request.headers.authorization,
          internalServiceToken,
        )
      )
        return reply.status(401).send({
          code: "UNAUTHORIZED",
          message: "A valid internal service token is required",
        });
      try {
        return await olasGateway.submit(request.body, request.id);
      } catch (error) {
        if (error instanceof OlasGatewayError)
          return reply.status(error.statusCode).send({
            code: error.code,
            message: error.message,
          });
        request.log.error({ error }, "Olas KeeperHub gateway failed");
        return reply.status(500).send({
          code: "OLAS_GATEWAY_FAILED",
          message: "The Olas execution gateway failed",
        });
      }
    },
  );

  server.post<{ Body: unknown }>(
    "/webhooks/olas/delivery",
    async (request, reply) => {
      if (!deliveryWebhookSecret)
        return reply.status(503).send({
          code: "DELIVERY_WEBHOOK_UNCONFIGURED",
          message: "Delivery webhook is not configured",
        });
      try {
        const payload = parseDeliveryWebhook(request.body);
        const result = await acceptOlasDelivery({
          store:
            store ??
            (() => {
              throw new DeliveryWebhookError(
                "STORE_UNCONFIGURED",
                "Persistence is not configured",
                503,
              );
            })(),
          payload,
          signature:
            typeof request.headers["x-synesis-signature"] === "string"
              ? request.headers["x-synesis-signature"]
              : undefined,
          secret: deliveryWebhookSecret,
        });
        return { ...result, status: result.accepted ? "accepted" : "replayed" };
      } catch (error) {
        if (error instanceof DeliveryWebhookError)
          return reply
            .status(error.statusCode)
            .send({ code: error.code, message: error.message });
        request.log.error({ error }, "Olas delivery webhook failed");
        return reply.status(500).send({
          code: "DELIVERY_WEBHOOK_FAILED",
          message: "Delivery webhook failed",
        });
      }
    },
  );

  registerAuthRoutes(server, {
    allowedOrigins,
    ...(store ? { store } : {}),
    ...(identityVerifier ? { identityVerifier } : {}),
    ...(options.secureCookies === undefined
      ? {}
      : { secureCookies: options.secureCookies }),
    ...(options.now ? { now: options.now } : {}),
    ...(integrationService ? { integrationService } : {}),
  });

  server.get("/api/v1/mechs", async (_request, reply) => {
    if (!mechDirectory)
      return reply.status(503).send({
        code: "OLAS_ADAPTER_UNCONFIGURED",
        message: "Live Olas discovery is not configured",
      });
    try {
      return await mechDirectory.read();
    } catch {
      return reply.status(503).send({
        code: "OLAS_DISCOVERY_UNAVAILABLE",
        message: "Live Olas discovery is temporarily unavailable",
      });
    }
  });

  server.get<{ Params: { address: string } }>(
    "/api/v1/mechs/:address",
    async (request, reply) => {
      if (!/^0x[0-9a-fA-F]{40}$/u.test(request.params.address))
        return reply.status(400).send({
          code: "INVALID_MECH_ADDRESS",
          message: "A full EVM Mech address is required",
        });
      if (!mechDirectory)
        return reply.status(503).send({
          code: "OLAS_ADAPTER_UNCONFIGURED",
          message: "Live Olas discovery is not configured",
        });
      try {
        const directory = await mechDirectory.read();
        const mech = directory.mechs.find(
          (candidate) =>
            candidate.address.toLowerCase() ===
            request.params.address.toLowerCase(),
        );
        if (!mech)
          return reply.status(404).send({
            code: "MECH_NOT_DISCOVERED",
            message: "The Mech is not in the current Base discovery result",
          });
        return mech;
      } catch {
        return reply.status(503).send({
          code: "OLAS_DISCOVERY_UNAVAILABLE",
          message: "Live Olas discovery is temporarily unavailable",
        });
      }
    },
  );

  if (ownedStore) {
    server.addHook("onClose", async () => ownedStore.close());
  }

  return server;
}
