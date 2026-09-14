import Link from "next/link";

const stages = [
  "Intent",
  "Procurement",
  "Quorum",
  "Simulation",
  "Execution",
  "Proof",
];

export default function ConsolePage() {
  return (
    <main className="page-shell">
      <nav className="nav">
        <Link className="wordmark" href="/">
          SYNESIS
        </Link>
        <span className="status">
          <i /> Demo mode
        </span>
      </nav>
      <section className="console-header">
        <div>
          <p className="eyebrow">Operations console</p>
          <h1>Decision pipeline</h1>
        </div>
        <button type="button">Create intent</button>
      </section>
      <ol className="pipeline">
        {stages.map((stage, index) => (
          <li key={stage}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{stage}</strong>
            <small>{index === 0 ? "Ready" : "Waiting"}</small>
          </li>
        ))}
      </ol>
    </main>
  );
}
