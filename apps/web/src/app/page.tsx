import Link from "next/link";
import { BrandMark } from "../components/brand-mark";

export default function HomePage() {
  return (
    <main className="page-shell">
      <nav className="nav">
        <Link className="landing-brand" href="/" aria-label="Synesis home">
          <BrandMark size={42} />
          <span className="wordmark">SYNESIS</span>
        </Link>
        <div className="landing-nav-links">
          <Link href="/app/mechs">Mech network</Link>
          <Link href="/verify/PRF-1041">Verify proof</Link>
          <Link href="/app">Open console</Link>
        </div>
      </nav>
      <section className="hero">
        <p className="eyebrow">
          Olas intelligence · KeeperHub execution · Base settlement
        </p>
        <h1>
          Paid intelligence.
          <br />
          Proven execution.
        </h1>
        <p className="lede">
          Synesis procures independent agent analysis, reaches a deterministic
          decision, and executes bounded value movement through KeeperHub.
        </p>
        <div className="hero-actions">
          <Link className="button" href="/app/intents/new">
            Create a bounded intent
          </Link>
          <Link className="text-action" href="/verify/PRF-1041">
            Inspect verified evidence →
          </Link>
        </div>
      </section>
      <section className="landing-flow" aria-label="Synesis execution flow">
        <article>
          <span>01</span>
          <strong>Procure</strong>
          <p>Pay two independent Olas Mechs for structured analysis.</p>
        </article>
        <article>
          <span>02</span>
          <strong>Decide</strong>
          <p>Evaluate immutable responses with deterministic guardrails.</p>
        </article>
        <article>
          <span>03</span>
          <strong>Execute</strong>
          <p>Simulate and move bounded value exclusively through KeeperHub.</p>
        </article>
        <article>
          <span>04</span>
          <strong>Prove</strong>
          <p>
            Publish receipts, hashes, and position deltas anyone can verify.
          </p>
        </article>
      </section>
    </main>
  );
}
