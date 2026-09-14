import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const OIDC_STATE_COOKIE = "__Host-synesis_oidc_state";
export const OIDC_VERIFIER_COOKIE = "__Host-synesis_oidc_verifier";
export const OIDC_NONCE_COOKIE = "__Host-synesis_oidc_nonce";
export const OIDC_RETURN_COOKIE = "__Host-synesis_oidc_return";

export const transactionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 10 * 60,
};

export const randomUrlToken = (): string =>
  randomBytes(32).toString("base64url");

export const pkceChallenge = (verifier: string): string =>
  createHash("sha256").update(verifier).digest("base64url");

export const secretsMatch = (
  left: string | undefined,
  right: string | undefined,
): boolean => {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

export const safeReturnTo = (value: string | null | undefined): string =>
  value?.startsWith("/app") && !value.startsWith("//") ? value : "/app";

export const readIdTokenNonce = (idToken: string): string | undefined => {
  const payloadPart = idToken.split(".")[1];
  if (!payloadPart) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf8"),
    ) as unknown;
    if (typeof payload !== "object" || payload === null) return undefined;
    const nonce = (payload as Record<string, unknown>).nonce;
    return typeof nonce === "string" ? nonce : undefined;
  } catch {
    return undefined;
  }
};
