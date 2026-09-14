import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  OIDC_NONCE_COOKIE,
  OIDC_RETURN_COOKIE,
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
  readIdTokenNonce,
  safeReturnTo,
  secretsMatch,
  transactionCookieOptions,
} from "../oidc";

const loginError = (request: NextRequest, code: string): NextResponse => {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
};

const expireTransactionCookies = (response: NextResponse): void => {
  for (const name of [
    OIDC_STATE_COOKIE,
    OIDC_VERIFIER_COOKIE,
    OIDC_NONCE_COOKIE,
    OIDC_RETURN_COOKIE,
  ]) {
    response.cookies.set(name, "", {
      ...transactionCookieOptions,
      maxAge: 0,
    });
  }
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const tokenUrl = process.env.OIDC_TOKEN_URL;
  const clientId = process.env.OIDC_CLIENT_ID;
  if (!tokenUrl || !clientId) return loginError(request, "oidc_unavailable");

  const cookieStore = await cookies();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = cookieStore.get(OIDC_STATE_COOKIE)?.value;
  const verifier = cookieStore.get(OIDC_VERIFIER_COOKIE)?.value;
  const expectedNonce = cookieStore.get(OIDC_NONCE_COOKIE)?.value;
  if (!code || !verifier || !secretsMatch(state ?? undefined, expectedState)) {
    return loginError(request, "invalid_callback");
  }

  const redirectUri =
    process.env.OIDC_REDIRECT_URI ??
    new URL("/api/auth/callback", request.nextUrl.origin).toString();
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  if (process.env.OIDC_CLIENT_SECRET) {
    form.set("client_secret", process.env.OIDC_CLIENT_SECRET);
  }

  let idToken: string | undefined;
  try {
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      cache: "no-store",
    });
    if (!tokenResponse.ok) return loginError(request, "token_exchange_failed");
    const tokenBody = (await tokenResponse.json()) as unknown;
    if (typeof tokenBody === "object" && tokenBody !== null) {
      const candidate = (tokenBody as Record<string, unknown>).id_token;
      if (typeof candidate === "string") idToken = candidate;
    }
  } catch {
    return loginError(request, "token_exchange_failed");
  }
  if (!idToken || !secretsMatch(readIdTokenNonce(idToken), expectedNonce)) {
    return loginError(request, "identity_rejected");
  }

  const publicOrigin =
    process.env.SYNESIS_PUBLIC_ORIGIN ?? request.nextUrl.origin;
  const apiUrl =
    process.env.SYNESIS_API_INTERNAL_URL ?? "http://localhost:4000";
  let authResponse: Response;
  try {
    authResponse = await fetch(new URL("/auth/session", apiUrl), {
      method: "POST",
      headers: { "content-type": "application/json", origin: publicOrigin },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    });
  } catch {
    return loginError(request, "session_unavailable");
  }
  if (!authResponse.ok) return loginError(request, "identity_rejected");

  const returnTo = safeReturnTo(cookieStore.get(OIDC_RETURN_COOKIE)?.value);
  const response = NextResponse.redirect(new URL(returnTo, request.url));
  for (const setCookie of authResponse.headers.getSetCookie()) {
    response.headers.append("set-cookie", setCookie);
  }
  expireTransactionCookies(response);
  return response;
}
