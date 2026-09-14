import Link from "next/link";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  return (
    <main className="page-shell">
      <nav className="nav">
        <Link className="wordmark" href="/">
          SYNESIS
        </Link>
      </nav>
      <section className="auth-panel">
        <p className="eyebrow">Secure operations access</p>
        <h1>Sign in to Synesis</h1>
        <p className="lede">
          Authentication is handled by your organization&apos;s verified OIDC
          identity provider. Sensitive actions require a fresh sign-in.
        </p>
        <a
          className="button"
          href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo ?? "/app")}`}
        >
          Continue with identity provider
        </a>
      </section>
    </main>
  );
}
