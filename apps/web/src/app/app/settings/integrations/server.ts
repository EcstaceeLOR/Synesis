import "server-only";
import { cookies } from "next/headers";
import type { IntegrationHealth } from "./types";
const apiUrl = process.env.SYNESIS_API_INTERNAL_URL ?? "http://localhost:4000";
const unconfigured = (message: string): IntegrationHealth => ({
  organizationId: "unselected",
  readiness: "NOT_READY",
  readyAt: null,
  wallet: null,
  checks: [
    {
      component: "session",
      status: "unconfigured",
      message,
      details: {},
      durationMs: 0,
      checkedAt: new Date().toISOString(),
    },
  ],
});
export const sessionContext = async (): Promise<{
  cookieHeader: string;
  csrfToken?: string;
  organizationId: string;
} | null> => {
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const response = await fetch(`${apiUrl}/auth/session`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    memberships?: readonly { readonly organizationId: string }[];
  };
  const organizationId = payload.memberships?.[0]?.organizationId;
  if (!organizationId) return null;
  const csrfToken = jar.get("__Host-synesis_csrf")?.value;
  return {
    cookieHeader,
    organizationId,
    ...(csrfToken ? { csrfToken } : {}),
  };
};
export const loadIntegrationHealth = async (): Promise<IntegrationHealth> => {
  try {
    const context = await sessionContext();
    if (!context)
      return unconfigured(
        "Sign in and select an organization to configure live integrations.",
      );
    const response = await fetch(
      `${apiUrl}/api/v1/integrations/health?organizationId=${encodeURIComponent(context.organizationId)}`,
      { headers: { cookie: context.cookieHeader }, cache: "no-store" },
    );
    if (!response.ok)
      return unconfigured(
        "Integration health is unavailable. Check the API encryption-key configuration.",
      );
    return (await response.json()) as IntegrationHealth;
  } catch {
    return unconfigured(
      "The Synesis API is unreachable. Start the API and try again.",
    );
  }
};
export const callIntegrationApi = async (
  path: string,
  body?: Readonly<Record<string, string>>,
): Promise<IntegrationHealth> => {
  const context = await sessionContext();
  if (!context?.csrfToken)
    throw new Error("Sign in again before changing integration settings.");
  const response = await fetch(
    `${apiUrl}${path}?organizationId=${encodeURIComponent(context.organizationId)}`,
    {
      method: "POST",
      headers: {
        cookie: context.cookieHeader,
        origin: process.env.SYNESIS_PUBLIC_ORIGIN ?? "http://localhost:3000",
        "content-type": "application/json",
        "x-csrf-token": context.csrfToken,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      payload?.error?.message ??
        `Verification failed with HTTP ${response.status}`,
    );
  }
  return (await response.json()) as IntegrationHealth;
};
