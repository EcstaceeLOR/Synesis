import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import cookie from "@fastify/cookie";
import {
  asEncryptedSecretReference,
  type AuthSessionRecord,
  type MembershipRecord,
  type OrganizationRole,
  type SynesisStore,
  type UserRecord,
} from "@synesis/database";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";

import type {
  IntegrationCredentials,
  IntegrationService,
} from "./integrations.js";

export const SESSION_COOKIE = "__Host-synesis_session";
export const CSRF_COOKIE = "__Host-synesis_csrf";
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1_000;
export const RECENT_AUTH_WINDOW_MS = 10 * 60 * 1_000;

export interface VerifiedIdentity {
  readonly provider: string;
  readonly subject: string;
  readonly email: string;
  readonly authenticatedAt?: string;
}

export interface IdentityVerifier {
  verify(idToken: string): Promise<VerifiedIdentity>;
}

export interface OidcIdentityVerifierOptions {
  readonly issuer: string;
  readonly audience: string;
  readonly jwksUrl: string;
}

export const createOidcIdentityVerifier = (
  options: OidcIdentityVerifierOptions,
): IdentityVerifier => {
  const issuer = new URL(options.issuer);
  const jwksUrl = new URL(options.jwksUrl);
  if (issuer.protocol !== "https:" || jwksUrl.protocol !== "https:") {
    throw new Error("OIDC issuer and JWKS URLs must use HTTPS");
  }
  const jwks = createRemoteJWKSet(jwksUrl);
  return {
    verify: async (idToken) => {
      const { payload } = await jwtVerify(idToken, jwks, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ["RS256", "ES256"],
      });
      if (
        typeof payload.sub !== "string" ||
        typeof payload.email !== "string" ||
        payload.email_verified !== true
      ) {
        throw new Error("The identity token lacks a verified email or subject");
      }
      return {
        provider: options.issuer,
        subject: payload.sub,
        email: payload.email.toLowerCase(),
        ...(typeof payload.auth_time === "number"
          ? {
              authenticatedAt: new Date(
                payload.auth_time * 1_000,
              ).toISOString(),
            }
          : {}),
      };
    },
  };
};

export const hashBrowserSecret = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const sameSecret = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const bodyRecord = (body: unknown): Record<string, unknown> | undefined =>
  typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : undefined;

const sendError = (
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
) => reply.status(statusCode).send({ error: { code, message } });

interface AuthContext {
  readonly session: AuthSessionRecord;
  readonly user: UserRecord;
}

type Capability =
  | "organization:read"
  | "intent:operate"
  | "approval:decide"
  | "organization:administer";

const roleCapabilities: Readonly<Record<OrganizationRole, Set<Capability>>> = {
  viewer: new Set(["organization:read"]),
  operator: new Set(["organization:read", "intent:operate"]),
  approver: new Set(["organization:read", "approval:decide"]),
  owner: new Set([
    "organization:read",
    "intent:operate",
    "approval:decide",
    "organization:administer",
  ]),
};

const isRole = (value: string): value is OrganizationRole =>
  value === "viewer" ||
  value === "operator" ||
  value === "approver" ||
  value === "owner";

const memberCan = (
  membership: MembershipRecord,
  capability: Capability,
): boolean =>
  isRole(membership.role) && roleCapabilities[membership.role].has(capability);

export interface AuthRouteOptions {
  readonly store?: SynesisStore;
  readonly identityVerifier?: IdentityVerifier;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly secureCookies?: boolean;
  readonly now?: () => Date;
  readonly integrationService?: IntegrationService;
}

export const registerAuthRoutes = (
  server: FastifyInstance,
  options: AuthRouteOptions,
): void => {
  server.register(cookie);
  const store = options.store;
  const now = options.now ?? (() => new Date());
  const secureCookies = options.secureCookies ?? true;
  const cookieOptions = {
    path: "/",
    secure: secureCookies,
    sameSite: "strict" as const,
  };

  const requireStore = (reply: FastifyReply): SynesisStore | undefined => {
    if (store) return store;
    void sendError(
      reply,
      503,
      "AUTH_UNAVAILABLE",
      "Authentication persistence is not configured",
    );
    return undefined;
  };

  const requireTrustedOrigin = (
    request: FastifyRequest,
    reply: FastifyReply,
  ): boolean => {
    const origin = request.headers.origin;
    if (typeof origin === "string" && options.allowedOrigins.has(origin)) {
      return true;
    }
    void sendError(
      reply,
      403,
      "ORIGIN_REJECTED",
      "Request origin is not trusted",
    );
    return false;
  };

  const authenticate = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AuthContext | undefined> => {
    const persistence = requireStore(reply);
    if (!persistence) return undefined;
    const token = request.cookies[SESSION_COOKIE];
    if (!token) {
      await sendError(reply, 401, "AUTH_REQUIRED", "Sign in to continue");
      return undefined;
    }
    const current = now().toISOString();
    const session = await persistence.read.authSessions.findActiveByTokenHash(
      hashBrowserSecret(token),
      current,
    );
    if (!session) {
      await sendError(
        reply,
        401,
        "SESSION_INVALID",
        "Session is invalid or expired",
      );
      return undefined;
    }
    const user = await persistence.read.users.findById(session.userId);
    if (!user || user.status !== "active") {
      await sendError(reply, 403, "ACCOUNT_DISABLED", "Account is not active");
      return undefined;
    }
    return { session, user };
  };

  const requireCsrf = (
    request: FastifyRequest,
    reply: FastifyReply,
    context: AuthContext,
  ): boolean => {
    if (!requireTrustedOrigin(request, reply)) return false;
    const cookieToken = request.cookies[CSRF_COOKIE];
    const headerToken = request.headers["x-csrf-token"];
    if (
      !cookieToken ||
      typeof headerToken !== "string" ||
      !sameSecret(cookieToken, headerToken) ||
      !sameSecret(hashBrowserSecret(headerToken), context.session.csrfTokenHash)
    ) {
      void sendError(reply, 403, "CSRF_REJECTED", "CSRF verification failed");
      return false;
    }
    return true;
  };

  const authorize = async (
    reply: FastifyReply,
    context: AuthContext,
    organizationId: string,
    capability: Capability,
    recentAuthentication = false,
  ): Promise<MembershipRecord | undefined> => {
    const persistence = requireStore(reply);
    if (!persistence) return undefined;
    const membership = await persistence.read.memberships.find(
      organizationId,
      context.user.id,
    );
    if (!membership) {
      await sendError(
        reply,
        404,
        "ORGANIZATION_NOT_FOUND",
        "Organization not found",
      );
      return undefined;
    }
    if (!memberCan(membership, capability)) {
      await sendError(
        reply,
        403,
        "INSUFFICIENT_ROLE",
        "Your role cannot perform this action",
      );
      return undefined;
    }
    const authenticationAge =
      now().getTime() - new Date(context.session.authenticatedAt).getTime();
    if (
      recentAuthentication &&
      (!Number.isFinite(authenticationAge) ||
        authenticationAge < -60_000 ||
        authenticationAge > RECENT_AUTH_WINDOW_MS)
    ) {
      await sendError(
        reply,
        401,
        "RECENT_AUTH_REQUIRED",
        "Re-authenticate before performing this sensitive action",
      );
      return undefined;
    }
    return membership;
  };

  const setSessionCookies = (
    reply: FastifyReply,
    token: string,
    csrfToken: string,
    expires: Date,
  ): void => {
    reply.setCookie(SESSION_COOKIE, token, {
      ...cookieOptions,
      httpOnly: true,
      expires,
    });
    reply.setCookie(CSRF_COOKIE, csrfToken, {
      ...cookieOptions,
      httpOnly: false,
      expires,
    });
  };

  server.post("/auth/session", async (request, reply) => {
    const persistence = requireStore(reply);
    if (!persistence || !requireTrustedOrigin(request, reply)) return;
    if (!options.identityVerifier) {
      return sendError(
        reply,
        503,
        "OIDC_UNAVAILABLE",
        "OIDC is not configured",
      );
    }
    const idToken = bodyRecord(request.body)?.idToken;
    if (typeof idToken !== "string" || idToken.length < 20) {
      return sendError(
        reply,
        400,
        "INVALID_ID_TOKEN",
        "An OIDC ID token is required",
      );
    }
    let identity: VerifiedIdentity;
    try {
      identity = await options.identityVerifier.verify(idToken);
    } catch {
      return sendError(
        reply,
        401,
        "IDENTITY_REJECTED",
        "Identity token was rejected",
      );
    }
    const issuedAt = now();
    const expires = new Date(issuedAt.getTime() + SESSION_LIFETIME_MS);
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const sessionId = randomUUID();
    const user = await persistence.transaction(async (repositories) => {
      const persistedUser = await repositories.users.upsertIdentity({
        id: randomUUID(),
        email: identity.email,
        authProvider: identity.provider,
        authSubject: identity.subject,
      });
      await repositories.authSessions.create({
        id: sessionId,
        userId: persistedUser.id,
        tokenHash: hashBrowserSecret(token),
        csrfTokenHash: hashBrowserSecret(csrfToken),
        authenticatedAt: identity.authenticatedAt ?? issuedAt.toISOString(),
        lastSeenAt: issuedAt.toISOString(),
        expiresAt: expires.toISOString(),
      });
      return persistedUser;
    });
    setSessionCookies(reply, token, csrfToken, expires);
    return reply.status(201).send({ user: { id: user.id, email: user.email } });
  });

  server.get("/auth/session", async (request, reply) => {
    const context = await authenticate(request, reply);
    if (!context || !store) return;
    const memberships = await store.read.memberships.listForUser(
      context.user.id,
    );
    return {
      user: { id: context.user.id, email: context.user.email },
      memberships: memberships.map(({ organizationId, role }) => ({
        organizationId,
        role,
      })),
    };
  });

  server.post("/auth/reauthenticate", async (request, reply) => {
    const context = await authenticate(request, reply);
    if (!context || !store || !requireCsrf(request, reply, context)) return;
    if (!options.identityVerifier) {
      return sendError(
        reply,
        503,
        "OIDC_UNAVAILABLE",
        "OIDC is not configured",
      );
    }
    const idToken = bodyRecord(request.body)?.idToken;
    if (typeof idToken !== "string" || idToken.length < 20) {
      return sendError(
        reply,
        400,
        "INVALID_ID_TOKEN",
        "An OIDC ID token is required",
      );
    }
    let identity: VerifiedIdentity;
    try {
      identity = await options.identityVerifier.verify(idToken);
    } catch {
      return sendError(
        reply,
        401,
        "IDENTITY_REJECTED",
        "Identity token was rejected",
      );
    }
    const authenticatedAt = identity.authenticatedAt
      ? new Date(identity.authenticatedAt)
      : undefined;
    if (
      identity.provider !== context.user.authProvider ||
      identity.subject !== context.user.authSubject ||
      !authenticatedAt ||
      !Number.isFinite(authenticatedAt.getTime()) ||
      now().getTime() - authenticatedAt.getTime() > RECENT_AUTH_WINDOW_MS ||
      authenticatedAt.getTime() > now().getTime() + 60_000
    ) {
      return sendError(
        reply,
        401,
        "REAUTHENTICATION_REJECTED",
        "A fresh token for the signed-in identity is required",
      );
    }
    const csrfToken = randomBytes(32).toString("base64url");
    await store.transaction((repositories) =>
      repositories.authSessions.markReauthenticated({
        id: context.session.id,
        authenticatedAt: authenticatedAt.toISOString(),
        csrfTokenHash: hashBrowserSecret(csrfToken),
      }),
    );
    reply.setCookie(CSRF_COOKIE, csrfToken, {
      ...cookieOptions,
      httpOnly: false,
      expires: new Date(context.session.expiresAt),
    });
    return reply.status(204).send();
  });

  server.delete("/auth/session", async (request, reply) => {
    const context = await authenticate(request, reply);
    if (!context || !store || !requireCsrf(request, reply, context)) return;
    await store.transaction((repositories) =>
      repositories.authSessions.revoke(context.session.id, now().toISOString()),
    );
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    reply.clearCookie(CSRF_COOKIE, cookieOptions);
    return reply.status(204).send();
  });

  server.post("/organizations", async (request, reply) => {
    const context = await authenticate(request, reply);
    if (!context || !store || !requireCsrf(request, reply, context)) return;
    const body = bodyRecord(request.body);
    const name = body?.name;
    const environment = body?.environment;
    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      (environment !== "demo" && environment !== "live")
    ) {
      return sendError(
        reply,
        400,
        "INVALID_ORGANIZATION",
        "Name and environment are required",
      );
    }
    const organizationId = randomUUID();
    await store.transaction(async (repositories) => {
      await repositories.organizations.create({
        id: organizationId,
        name: name.trim(),
        environment,
      });
      await repositories.memberships.create({
        organizationId,
        userId: context.user.id,
        role: "owner",
      });
      await repositories.auditEvents.recordSecurityEvent({
        id: randomUUID(),
        organizationId,
        actor: { type: "USER", id: context.user.id },
        action: "organization.created",
        entityType: "organization",
        entityId: organizationId,
        traceId: request.id,
        occurredAt: now().toISOString(),
      });
    });
    return reply
      .status(201)
      .send({ id: organizationId, name: name.trim(), environment });
  });

  server.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId",
    async (request, reply) => {
      const context = await authenticate(request, reply);
      if (!context || !store) return;
      const membership = await authorize(
        reply,
        context,
        request.params.organizationId,
        "organization:read",
      );
      if (!membership) return;
      const organization = await store.read.organizations.findById(
        request.params.organizationId,
      );
      if (!organization) {
        return sendError(
          reply,
          404,
          "ORGANIZATION_NOT_FOUND",
          "Organization not found",
        );
      }
      return { organization, role: membership.role };
    },
  );

  server.patch<{
    Params: { organizationId: string; userId: string };
  }>(
    "/organizations/:organizationId/members/:userId/role",
    async (request, reply) => {
      const context = await authenticate(request, reply);
      if (!context || !store || !requireCsrf(request, reply, context)) return;
      if (
        !(await authorize(
          reply,
          context,
          request.params.organizationId,
          "organization:administer",
          true,
        ))
      )
        return;
      const role = bodyRecord(request.body)?.role;
      if (typeof role !== "string" || !isRole(role)) {
        return sendError(reply, 400, "INVALID_ROLE", "Role is not supported");
      }
      if (request.params.userId === context.user.id) {
        return sendError(
          reply,
          403,
          "SELF_ROLE_CHANGE_REJECTED",
          "Owners cannot change their own role",
        );
      }
      const updated = await store.transaction(async (repositories) => {
        const previous = await repositories.memberships.find(
          request.params.organizationId,
          request.params.userId,
        );
        if (!previous) return undefined;
        if (
          previous.role === "owner" &&
          role !== "owner" &&
          (await repositories.memberships.countOwners(
            request.params.organizationId,
          )) <= 1
        ) {
          return "last-owner" as const;
        }
        const membership = await repositories.memberships.setRole({
          organizationId: request.params.organizationId,
          userId: request.params.userId,
          role,
        });
        await repositories.auditEvents.recordSecurityEvent({
          id: randomUUID(),
          organizationId: request.params.organizationId,
          actor: { type: "USER", id: context.user.id },
          action: "membership.role.changed",
          entityType: "membership",
          entityId: request.params.userId,
          traceId: request.id,
          reason: `${previous.role} -> ${role}`,
          occurredAt: now().toISOString(),
        });
        return membership;
      });
      if (!updated)
        return sendError(
          reply,
          404,
          "MEMBERSHIP_NOT_FOUND",
          "Membership not found",
        );
      if (updated === "last-owner") {
        return sendError(
          reply,
          409,
          "LAST_OWNER",
          "The final owner cannot be demoted",
        );
      }
      return { membership: updated };
    },
  );

  server.post<{
    Params: { organizationId: string; intentId: string };
  }>(
    "/organizations/:organizationId/intents/:intentId/approval",
    async (request, reply) => {
      const context = await authenticate(request, reply);
      if (!context || !store || !requireCsrf(request, reply, context)) return;
      if (
        !(await authorize(
          reply,
          context,
          request.params.organizationId,
          "approval:decide",
          true,
        ))
      )
        return;
      const body = bodyRecord(request.body);
      const decision = body?.decision;
      const reason = body?.reason;
      if (
        (decision !== "approve" && decision !== "reject") ||
        (reason !== undefined && typeof reason !== "string")
      ) {
        return sendError(
          reply,
          400,
          "INVALID_DECISION",
          "Decision must be approve or reject",
        );
      }
      const intent = await store.read.intents.findByOrganizationAndId(
        request.params.organizationId,
        request.params.intentId,
      );
      if (!intent)
        return sendError(reply, 404, "INTENT_NOT_FOUND", "Intent not found");
      const decisionId = randomUUID();
      await store.transaction(async (repositories) => {
        await repositories.approvalDecisions.create({
          id: decisionId,
          organizationId: request.params.organizationId,
          intentId: request.params.intentId,
          userId: context.user.id,
          decision,
          ...(reason === undefined ? {} : { reason }),
        });
        await repositories.auditEvents.recordSecurityEvent({
          id: randomUUID(),
          organizationId: request.params.organizationId,
          actor: { type: "USER", id: context.user.id },
          action: `approval.${decision}`,
          entityType: "intent",
          entityId: request.params.intentId,
          traceId: request.id,
          ...(reason === undefined ? {} : { reason }),
          occurredAt: now().toISOString(),
        });
      });
      return reply.status(201).send({ id: decisionId, decision });
    },
  );

  server.post<{
    Params: { organizationId: string; policyVersionId: string };
  }>(
    "/organizations/:organizationId/policies/:policyVersionId/activate",
    async (request, reply) => {
      const context = await authenticate(request, reply);
      if (!context || !store || !requireCsrf(request, reply, context)) return;
      if (
        !(await authorize(
          reply,
          context,
          request.params.organizationId,
          "organization:administer",
          true,
        ))
      )
        return;
      const activated = await store.transaction(async (repositories) => {
        const changed = await repositories.policyVersions.activate({
          id: request.params.policyVersionId,
          organizationId: request.params.organizationId,
          activatedAt: now().toISOString(),
        });
        if (!changed) return false;
        await repositories.auditEvents.recordSecurityEvent({
          id: randomUUID(),
          organizationId: request.params.organizationId,
          actor: { type: "USER", id: context.user.id },
          action: "policy.activated",
          entityType: "policy_version",
          entityId: request.params.policyVersionId,
          traceId: request.id,
          occurredAt: now().toISOString(),
        });
        return true;
      });
      if (!activated)
        return sendError(
          reply,
          404,
          "POLICY_NOT_FOUND",
          "Policy version not found",
        );
      return reply.status(204).send();
    },
  );

  server.put<{ Params: { organizationId: string; integrationType: string } }>(
    "/organizations/:organizationId/integrations/:integrationType",
    async (request, reply) => {
      const context = await authenticate(request, reply);
      if (!context || !store || !requireCsrf(request, reply, context)) return;
      if (
        !(await authorize(
          reply,
          context,
          request.params.organizationId,
          "organization:administer",
          true,
        ))
      )
        return;
      const secretReference = bodyRecord(request.body)?.secretReference;
      if (typeof secretReference !== "string") {
        return sendError(
          reply,
          400,
          "INVALID_SECRET_REFERENCE",
          "An encrypted secret reference is required",
        );
      }
      let encryptedSecretRef;
      try {
        encryptedSecretRef = asEncryptedSecretReference(secretReference);
      } catch {
        return sendError(
          reply,
          400,
          "INVALID_SECRET_REFERENCE",
          "Use a vault://, kms://, or secret-manager:// reference",
        );
      }
      await store.transaction(async (repositories) => {
        await repositories.integrationConnections.upsert({
          id: randomUUID(),
          organizationId: request.params.organizationId,
          integrationType: request.params.integrationType,
          encryptedSecretRef,
        });
        await repositories.auditEvents.recordSecurityEvent({
          id: randomUUID(),
          organizationId: request.params.organizationId,
          actor: { type: "USER", id: context.user.id },
          action: "integration.changed",
          entityType: "integration",
          entityId: request.params.integrationType,
          traceId: request.id,
          occurredAt: now().toISOString(),
        });
      });
      return reply.status(204).send();
    },
  );

  server.get<{ Querystring: { organizationId?: string } }>(
    "/api/v1/integrations/health",
    async (request, reply) => {
      const context = await authenticate(request, reply);
      if (!context || !store) return;
      const organizationId = request.query.organizationId;
      if (!organizationId) {
        return sendError(
          reply,
          400,
          "ORGANIZATION_REQUIRED",
          "Select an organization to inspect integration health",
        );
      }
      if (
        !(await authorize(reply, context, organizationId, "organization:read"))
      )
        return;
      if (!options.integrationService) {
        return sendError(
          reply,
          503,
          "INTEGRATIONS_UNAVAILABLE",
          "Integration verification is not configured",
        );
      }
      return options.integrationService.readHealth(organizationId);
    },
  );

  server.post<{ Querystring: { organizationId?: string } }>(
    "/api/v1/integrations/keeperhub/test",
    async (request, reply) => {
      const context = await authenticate(request, reply);
      if (!context || !store || !requireCsrf(request, reply, context)) return;
      const organizationId = request.query.organizationId;
      if (!organizationId) {
        return sendError(
          reply,
          400,
          "ORGANIZATION_REQUIRED",
          "Select an organization to configure integrations",
        );
      }
      if (
        !(await authorize(
          reply,
          context,
          organizationId,
          "organization:administer",
          true,
        ))
      )
        return;
      if (!options.integrationService) {
        return sendError(
          reply,
          503,
          "INTEGRATIONS_UNAVAILABLE",
          "Integration verification is not configured",
        );
      }
      const body = bodyRecord(request.body);
      const required = [
        "keeperHubApiKey",
        "baseRpcUrl",
        "ipfsGatewayUrl",
        "deliveryWebhookUrl",
        "deliveryWebhookSecret",
      ] as const;
      if (!body || required.some((field) => typeof body[field] !== "string")) {
        return sendError(
          reply,
          400,
          "INVALID_INTEGRATION_SETTINGS",
          "KeeperHub, RPC, IPFS, and webhook settings are required",
        );
      }
      const credentials: IntegrationCredentials = {
        keeperHubApiKey: body.keeperHubApiKey as string,
        baseRpcUrl: body.baseRpcUrl as string,
        ipfsGatewayUrl: body.ipfsGatewayUrl as string,
        deliveryWebhookUrl: body.deliveryWebhookUrl as string,
        deliveryWebhookSecret: body.deliveryWebhookSecret as string,
        ...(typeof body.olasSubgraphUrl === "string" && body.olasSubgraphUrl
          ? { olasSubgraphUrl: body.olasSubgraphUrl }
          : {}),
      };
      try {
        const summary = await options.integrationService.configureAndCheck(
          organizationId,
          credentials,
        );
        await store.transaction((repositories) =>
          repositories.auditEvents.recordSecurityEvent({
            id: randomUUID(),
            organizationId,
            actor: { type: "USER", id: context.user.id },
            action: "integration.onboarding.verified",
            entityType: "integration",
            entityId: "keeperhub",
            traceId: request.id,
            reason: `readiness=${summary.readiness}`,
            occurredAt: now().toISOString(),
          }),
        );
        return summary;
      } catch (error) {
        return sendError(
          reply,
          error instanceof TypeError ? 400 : 502,
          error instanceof TypeError
            ? "INVALID_INTEGRATION_SETTINGS"
            : "INTEGRATION_CHECK_FAILED",
          error instanceof Error
            ? error.message
            : "Integration verification failed",
        );
      }
    },
  );

  server.post<{ Querystring: { organizationId?: string } }>(
    "/api/v1/integrations/olas/test",
    async (request, reply) => {
      const context = await authenticate(request, reply);
      if (!context || !store || !requireCsrf(request, reply, context)) return;
      const organizationId = request.query.organizationId;
      if (!organizationId)
        return sendError(
          reply,
          400,
          "ORGANIZATION_REQUIRED",
          "Select an organization to recheck integrations",
        );
      if (
        !(await authorize(
          reply,
          context,
          organizationId,
          "organization:administer",
        ))
      )
        return;
      if (!options.integrationService)
        return sendError(
          reply,
          503,
          "INTEGRATIONS_UNAVAILABLE",
          "Integration verification is not configured",
        );
      try {
        return await options.integrationService.recheck(organizationId);
      } catch (error) {
        return sendError(
          reply,
          502,
          "INTEGRATION_CHECK_FAILED",
          error instanceof Error
            ? error.message
            : "Integration verification failed",
        );
      }
    },
  );

  server.delete<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/pause",
    async (request, reply) => {
      const context = await authenticate(request, reply);
      if (!context || !store || !requireCsrf(request, reply, context)) return;
      if (
        !(await authorize(
          reply,
          context,
          request.params.organizationId,
          "organization:administer",
          true,
        ))
      )
        return;
      const organization = await store.transaction(async (repositories) => {
        const changed = await repositories.organizations.clearPause(
          request.params.organizationId,
        );
        if (!changed) return undefined;
        await repositories.auditEvents.recordSecurityEvent({
          id: randomUUID(),
          organizationId: request.params.organizationId,
          actor: { type: "USER", id: context.user.id },
          action: "organization.pause.removed",
          entityType: "organization",
          entityId: request.params.organizationId,
          traceId: request.id,
          occurredAt: now().toISOString(),
        });
        return changed;
      });
      if (!organization)
        return sendError(
          reply,
          404,
          "ORGANIZATION_NOT_FOUND",
          "Organization not found",
        );
      return reply.status(204).send();
    },
  );
};
