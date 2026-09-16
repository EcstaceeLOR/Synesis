import { type NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE = "__Host-synesis_session";

export function proxy(request: NextRequest): NextResponse {
  if (process.env.SYNESIS_E2E === "1") return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "returnTo",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/app/:path*"],
};
