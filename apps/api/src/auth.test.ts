import type {
  AuthSessionRecord,
  MembershipRecord,
  OrganizationRecord,
  SecurityAuditEventInput,
  SynesisStore,
  TransactionRepositories,
  UserRecord,
} from "@synesis/database";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "./app.js";
import {
  CSRF_COOKIE,
  hashBrowserSecret,
  SESSION_COOKIE,
  type IdentityVerifier,
} from "./auth.js";

const now = new Date("2026-09-14T12:00:00.000Z");
const origin = "https://synesis.test";
const sessionToken = "session-token-known-only-to-browser";
const csrfToken = "csrf-token-known-only-to-browser";

const user: UserRecord = {
  id: "user-alice",
  email: "alice@synesis.test",
  authProvider: "https://identity.test/",
  authSubject: "alice-subject",
  status: "active",
  createdAt: "2026-09-14T10:00:00.000Z",
};

const session = (authenticatedAt = now.toISOString()): AuthSessionRecord => ({
  id: "session-alice",
  userId: user.id,
  tokenHash: hashBrowserSecret(sessionToken),
  csrfTokenHash: hashBrowserSecret(csrfToken),
  authenticatedAt,
  lastSeenAt: now.toISOString(),
  expiresAt: "2026-09-15T00:00:00.000Z",
  revokedAt: null,
  createdAt: "2026-09-14T10:00:00.000Z",
});

const organization: OrganizationRecord = {
  id: "org-alpha",
  name: "Alpha Treasury",
  environment: "demo",
  pausedAt: null,
  integrationStatus: "NOT_READY",
  integrationsReadyAt: null,
  createdAt: "2026-09-14T10:00:00.000Z",
};

const membership = (role: MembershipRecord["role"]): MembershipRecord => ({
  organizationId: organization.id,
  userId: user.id,
  role,
  createdAt: "2026-09-14T10:00:00.000Z",
});

interface StoreCapture {
  sessionCreated?: Record<string, unknown>;
  secretReference?: string;
  auditEvents: SecurityAuditEventInput[];
}

const createStore = (
  input: {
    role?: MembershipRecord["role"];
    authenticatedAt?: string;
    capture?: StoreCapture;
  } = {},
): SynesisStore => {
  const activeSession = session(input.authenticatedAt);
  const member = input.role ? membership(input.role) : undefined;
  const capture = input.capture ?? { auditEvents: [] };
  const read = {
    authSessions: {
      findActiveByTokenHash: vi.fn((hash: string) =>
        Promise.resolve(
          hash === activeSession.tokenHash ? activeSession : undefined,
        ),
      ),
    },
    users: {
      findById: vi.fn((id: string) =>
        Promise.resolve(id === user.id ? user : undefined),
      ),
      findByProviderSubject: vi.fn(),
    },
    memberships: {
      find: vi.fn((organizationId: string, userId: string) =>
        Promise.resolve(
          member?.organizationId === organizationId && member.userId === userId
            ? member
            : undefined,
        ),
      ),
      listForUser: vi.fn(() => Promise.resolve(member ? [member] : [])),
    },
    organizations: {
      findById: vi.fn((id: string) =>
        Promise.resolve(id === organization.id ? organization : undefined),
      ),
    },
    intents: {
      findByOrganizationAndId: vi.fn(),
      findById: vi.fn(),
      listActive: vi.fn(),
    },
  };
  const transactionRepositories = {
    ...read,
    users: {
      ...read.users,
      upsertIdentity: vi.fn(() => Promise.resolve(user)),
    },
    authSessions: {
      ...read.authSessions,
      create: vi.fn((created: Record<string, unknown>) => {
        capture.sessionCreated = created;
        return Promise.resolve();
      }),
      markReauthenticated: vi.fn(),
      revoke: vi.fn(),
      touch: vi.fn(),
    },
    memberships: {
      ...read.memberships,
      create: vi.fn(),
      setRole: vi.fn(),
      countOwners: vi.fn(() => Promise.resolve(1)),
    },
    integrationConnections: {
      upsert: vi.fn((connection: { encryptedSecretRef: string }) => {
        capture.secretReference = connection.encryptedSecretRef;
        return Promise.resolve();
      }),
    },
    auditEvents: {
      listForIntent: vi.fn(),
      listForOrganization: vi.fn(),
      recordSecurityEvent: vi.fn((event: SecurityAuditEventInput) => {
        capture.auditEvents.push(event);
        return Promise.resolve();
      }),
    },
  };
  return {
    read,
    transaction: async <T>(
      work: (repositories: TransactionRepositories) => Promise<T>,
    ): Promise<T> => await work(transactionRepositories as never),
    close: vi.fn(),
  } as unknown as SynesisStore;
};

const authenticatedHeaders = () => ({
  origin,
  cookie: `${SESSION_COOKIE}=${sessionToken}; ${CSRF_COOKIE}=${csrfToken}`,
  "x-csrf-token": csrfToken,
});

const servers: ReturnType<typeof buildServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("session security", () => {
  it("stores only hashes and issues hardened host cookies", async () => {
    const capture: StoreCapture = { auditEvents: [] };
    const verifier: IdentityVerifier = {
      verify: vi.fn(() =>
        Promise.resolve({
          provider: user.authProvider,
          subject: user.authSubject,
          email: user.email,
          authenticatedAt: now.toISOString(),
        }),
      ),
    };
    const server = buildServer({
      store: createStore({ capture }),
      identityVerifier: verifier,
      allowedOrigins: [origin],
      now: () => now,
    });
    servers.push(server);

    const response = await server.inject({
      method: "POST",
      url: "/auth/session",
      headers: { origin },
      payload: { idToken: "a-valid-looking-oidc-token" },
    });

    expect(response.statusCode).toBe(201);
    const cookies = response.headers["set-cookie"];
    expect(cookies).toHaveLength(2);
    expect(cookies?.[0]).toMatch(/^__Host-synesis_session=/u);
    expect(cookies?.[0]).toContain("Path=/");
    expect(cookies?.[0]).toContain("HttpOnly");
    expect(cookies?.[0]).toContain("Secure");
    expect(cookies?.[0]).toContain("SameSite=Strict");
    expect(cookies?.[1]).toMatch(/^__Host-synesis_csrf=/u);
    expect(cookies?.[1]).not.toContain("HttpOnly");
    expect(cookies?.[1]).toContain("Secure");
    expect(cookies?.[1]).toContain("SameSite=Strict");
    expect(capture.sessionCreated?.tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(capture.sessionCreated?.csrfTokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(capture.sessionCreated)).not.toContain("oidc-token");
  }, 15_000);

  it("rejects state changes without the double-submit CSRF proof", async () => {
    const server = buildServer({
      store: createStore({ role: "owner" }),
      allowedOrigins: [origin],
      now: () => now,
    });
    servers.push(server);

    const response = await server.inject({
      method: "DELETE",
      url: `/organizations/${organization.id}/pause`,
      headers: { origin, cookie: `${SESSION_COOKIE}=${sessionToken}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "CSRF_REJECTED" } });
  });
});

describe("organization isolation and RBAC", () => {
  it("does not reveal an organization from another tenant", async () => {
    const server = buildServer({
      store: createStore({ role: "viewer" }),
      allowedOrigins: [origin],
      now: () => now,
    });
    servers.push(server);

    const response = await server.inject({
      method: "GET",
      url: "/organizations/org-other-tenant",
      headers: { cookie: `${SESSION_COOKIE}=${sessionToken}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: "ORGANIZATION_NOT_FOUND" },
    });
  });

  it("blocks an operator attempting to grant an owner role", async () => {
    const server = buildServer({
      store: createStore({ role: "operator" }),
      allowedOrigins: [origin],
      now: () => now,
    });
    servers.push(server);

    const response = await server.inject({
      method: "PATCH",
      url: `/organizations/${organization.id}/members/user-bob/role`,
      headers: authenticatedHeaders(),
      payload: { role: "owner" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: "INSUFFICIENT_ROLE" },
    });
  });

  it.each([
    {
      label: "approval decisions",
      method: "POST" as const,
      url: `/organizations/${organization.id}/intents/intent-1/approval`,
      payload: { decision: "approve" },
    },
    {
      label: "policy activation",
      method: "POST" as const,
      url: `/organizations/${organization.id}/policies/policy-1/activate`,
      payload: {},
    },
    {
      label: "integration changes",
      method: "PUT" as const,
      url: `/organizations/${organization.id}/integrations/keeperhub`,
      payload: { secretReference: "vault://synesis/keeperhub" },
    },
    {
      label: "pause removal",
      method: "DELETE" as const,
      url: `/organizations/${organization.id}/pause`,
      payload: {},
    },
  ])(
    "requires recent authentication for $label",
    async ({ method, url, payload }) => {
      const server = buildServer({
        store: createStore({
          role: "owner",
          authenticatedAt: "2026-09-14T11:40:00.000Z",
        }),
        allowedOrigins: [origin],
        now: () => now,
      });
      servers.push(server);

      const response = await server.inject({
        method,
        url,
        headers: authenticatedHeaders(),
        payload,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: { code: "RECENT_AUTH_REQUIRED" },
      });
    },
  );

  it("audits a permitted integration change without credential material", async () => {
    const capture: StoreCapture = { auditEvents: [] };
    const server = buildServer({
      store: createStore({ role: "owner", capture }),
      allowedOrigins: [origin],
      now: () => now,
    });
    servers.push(server);

    const response = await server.inject({
      method: "PUT",
      url: `/organizations/${organization.id}/integrations/keeperhub`,
      headers: authenticatedHeaders(),
      payload: { secretReference: "vault://synesis/keeperhub-secret" },
    });

    expect(response.statusCode).toBe(204);
    expect(capture.secretReference).toBe("vault://synesis/keeperhub-secret");
    expect(capture.auditEvents).toMatchObject([
      {
        organizationId: organization.id,
        action: "integration.changed",
        entityId: "keeperhub",
      },
    ]);
    expect(JSON.stringify(capture.auditEvents)).not.toContain(
      "keeperhub-secret",
    );
  });
});
