import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <nav className="nav">
        <span className="wordmark">SYNESIS</span>
        <Link href="/app">Open console</Link>
      </nav>
      <section className="hero">
        <p className="eyebrow">Agent procurement and onchain execution</p>
        <h1>
          Paid intelligence.
          <br />
          Proven execution.
        </h1>
        <p className="lede">
          Synesis procures independent agent analysis, reaches a deterministic
          decision, and executes bounded value movement through KeeperHub.
        </p>
        <Link className="button" href="/app">
          Launch Synesis
        </Link>
      </section>
    </main>
  );
}
