# Authentication and organization authorization

Synesis uses an OIDC authorization-code flow with PKCE. The web application
creates short-lived `state`, `nonce`, and verifier cookies, exchanges the
callback code, and sends the resulting ID token to the API. The API verifies the
token signature, issuer, audience, expiry, subject, and verified email against a
configured HTTPS JWKS endpoint.

The API then creates an opaque database-backed session. Only SHA-256 hashes of
the session and CSRF tokens are stored. Browser cookies use the `__Host-`
prefix, `Secure`, `SameSite=Strict`, and a root path; the session cookie is also
`HttpOnly`. Production should expose the web and API behind the same HTTPS
origin so host-only cookies protect both the Next.js route boundary and API.

Every API authorization decision loads membership using both the signed-in user
ID and the organization ID from the route. Missing membership returns the same
404 response as a missing organization. Capabilities are explicit rather than
derived from a numeric role hierarchy:

| Role     | Capabilities                                     |
| -------- | ------------------------------------------------ |
| viewer   | Read organization data                           |
| operator | Read and operate intents                         |
| approver | Read and decide approvals                        |
| owner    | All capabilities and organization administration |

All browser mutations require a matching CSRF cookie/header pair and a trusted
`Origin`. Approval decisions, policy activation, integration changes, pause
removal, and membership changes additionally require authentication within the
last ten minutes. Re-authentication accepts only a fresh OIDC token for the same
issuer and subject.

Sensitive operations are recorded in `audit_events`. Audit payloads identify
the actor and affected entity but never contain ID tokens, session tokens, CSRF
tokens, client secrets, or encrypted-secret references.
