import { NextResponse, type NextRequest } from "next/server";

import {
  OIDC_NONCE_COOKIE,
  OIDC_RETURN_COOKIE,
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
  pkceChallenge,
  randomUrlToken,
  safeReturnTo,
  transactionCookieOptions,
} from "../oidc";

export function GET(request: NextRequest): NextResponse {
  const authorizationUrl = process.env.OIDC_AUTHORIZATION_URL;
  const clientId = process.env.OIDC_CLIENT_ID;
  if (!authorizationUrl || !clientId) {
    return NextResponse.json(
      {
        error: {
          code: "OIDC_UNAVAILABLE",
          message: "OIDC login is not configured",
        },
      },
      { status: 503 },
    );
  }

  const state = randomUrlToken();
  const verifier = randomUrlToken();
  const nonce = randomUrlToken();
  const redirectUri =
    process.env.OIDC_REDIRECT_URI ??
    new URL("/api/auth/callback", request.nextUrl.origin).toString();
  const destination = new URL(authorizationUrl);
  destination.searchParams.set("response_type", "code");
  destination.searchParams.set("client_id", clientId);
  destination.searchParams.set("redirect_uri", redirectUri);
  destination.searchParams.set("scope", "openid email profile");
  destination.searchParams.set("state", state);
  destination.searchParams.set("nonce", nonce);
  destination.searchParams.set("code_challenge", pkceChallenge(verifier));
  destination.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(destination);
  response.cookies.set(OIDC_STATE_COOKIE, state, transactionCookieOptions);
  response.cookies.set(
    OIDC_VERIFIER_COOKIE,
    verifier,
    transactionCookieOptions,
  );
  response.cookies.set(OIDC_NONCE_COOKIE, nonce, transactionCookieOptions);
  response.cookies.set(
    OIDC_RETURN_COOKIE,
    safeReturnTo(request.nextUrl.searchParams.get("returnTo")),
    transactionCookieOptions,
  );
  return response;
}
