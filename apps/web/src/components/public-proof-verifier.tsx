import { verifyPublicProofBundle } from "@synesis/domain";

export async function PublicProofVerifier({
  proofId,
}: {
  readonly proofId: string;
}) {
  const apiOrigin =
    process.env.SYNESIS_API_INTERNAL_URL ?? "http://localhost:4000";
  const publicOrigin = process.env.NEXT_PUBLIC_SYNESIS_API_URL ?? apiOrigin;
  try {
    const response = await fetch(
      new URL(`/api/v1/proofs/${encodeURIComponent(proofId)}`, apiOrigin),
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error("Proof unavailable");
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || !("bundle" in value))
      throw new Error("Proof response malformed");
    const verification = await verifyPublicProofBundle(value.bundle);
    return (
      <section className="data-section">
        <header>
          <div>
            <p className="section-index">// INDEPENDENT VERIFICATION</p>
            <h1>
              {verification.valid ? "Proof verified" : "Verification failed"}
            </h1>
            <p>
              Every public entry hash and the ordered proof root were
              recalculated without trusting UI state.
            </p>
          </div>
          <span className="data-contract">
            {verification.valid ? "HASH VALID" : "TAMPERED"}
          </span>
        </header>
        <div className="frozen-grid">
          {verification.bundle.entries.map((entry) => (
            <article key={entry.position}>
              <span>
                {entry.position.toString().padStart(2, "0")} / {entry.kind}
              </span>
              <strong>{entry.label}</strong>
              <small className="mono-copy">{entry.contentHash}</small>
              {entry.publicReference ? (
                <a
                  href={entry.publicReference}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open public source ↗
                </a>
              ) : null}
            </article>
          ))}
        </div>
        <a
          className="primary-action"
          href={`${publicOrigin}/api/v1/proofs/${encodeURIComponent(proofId)}?download=1`}
        >
          Download canonical JSON
        </a>
      </section>
    );
  } catch {
    return (
      <section className="data-section">
        <h1>Proof unavailable</h1>
        <p>
          The public bundle could not be retrieved or independently verified.
        </p>
        <span className="data-contract">VERIFICATION FAILED</span>
      </section>
    );
  }
}
