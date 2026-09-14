import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { createServiceHealth, environmentSchema } from "@synesis/domain";
import { createSynesisStore, type SynesisStore } from "@synesis/database";

import {
  createOidcIdentityVerifier,
  registerAuthRoutes,
  type IdentityVerifier,
} from "./auth.js";
import { EnvelopeEncryption, IntegrationService } from "./integrations.js";

export interface BuildServerOptions {
  readonly store?: SynesisStore;
  readonly identityVerifier?: IdentityVerifier;
  readonly allowedOrigins?: readonly string[];
  readonly secureCookies?: boolean;
  readonly now?: () => Date;
  readonly integrationService?: IntegrationService;
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

  if (ownedStore) {
    server.addHook("onClose", async () => ownedStore.close());
  }

  return server;
}
