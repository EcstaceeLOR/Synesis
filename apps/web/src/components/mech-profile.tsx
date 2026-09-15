import type { DiscoveredMech } from "@synesis/domain";
import {
  MetricCard,
  StatePanel,
  StatusBadge,
  type ViewState,
} from "@synesis/ui";
import Link from "next/link";

const short = (value: string) => `${value.slice(0, 12)}…${value.slice(-10)}`;

export function MechProfile({
  state,
}: {
  readonly state: ViewState<DiscoveredMech>;
}) {
  const mech = state.data;
  if (!mech)
    return (
      <div className="content-shell">
        <StatePanel
          state={state.status === "ready" ? { status: "error" } : state}
        />
      </div>
    );
  return (
    <div className="content-shell">
      <header className="page-heading">
        <div>
          <p className="app-eyebrow">
            Olas Mech / Base / Service #{mech.serviceId}
          </p>
          <h1>{mech.name}</h1>
          <p>{mech.description}</p>
        </div>
        <div className="page-actions">
          <StatusBadge tone={mech.eligible ? "positive" : "danger"}>
            {mech.eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}
          </StatusBadge>
          <Link className="secondary-action" href="/app/mechs">
            Back to marketplace
          </Link>
        </div>
      </header>
      <section className="metric-grid" aria-label="Mech facts">
        <MetricCard
          label="Compatibility"
          value={`${mech.compatibilityScore}/100`}
          detail={mech.health}
          accent={mech.eligible}
        />
        <MetricCard
          label="Service ID"
          value={String(mech.serviceId)}
          detail="Onchain identity matched"
        />
        <MetricCard
          label="Deliveries"
          value={mech.totalDeliveries.toLocaleString()}
          detail="Confirmed marketplace history"
        />
        <MetricCard
          label="Payment"
          value={mech.paymentType ?? "Unknown"}
          detail={
            mech.unitAmount === null
              ? "Quote unavailable"
              : `${mech.unitAmount} base units`
          }
        />
      </section>
      <section className="mech-facts" aria-label="Pinned identity">
        <div>
          <span>MECH ADDRESS</span>
          <strong className="mono-copy">{mech.address}</strong>
        </div>
        <div>
          <span>FACTORY</span>
          <strong className="mono-copy">
            {mech.factoryAddress ?? "Not published"}
          </strong>
        </div>
        <div>
          <span>METADATA CID</span>
          <strong className="mono-copy">
            {mech.metadataCid ?? "Not published"}
          </strong>
        </div>
        <div>
          <span>OBSERVED VERSION</span>
          <strong>{mech.observedVersion}</strong>
        </div>
      </section>
      {mech.reasons.length ? (
        <section className="data-section">
          <header>
            <div>
              <p className="section-index">// FAIL-CLOSED RESULT</p>
              <h2>Why this Mech is rejected</h2>
              <p>Every failed prerequisite blocks intent selection.</p>
            </div>
          </header>
          <div className="reason-grid">
            {mech.reasons.map((reason) => (
              <article key={reason.code}>
                <StatusBadge tone="danger">{reason.code}</StatusBadge>
                <p>{reason.message}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section className="data-section">
        <header>
          <div>
            <p className="section-index">// PINNED TOOL CONTRACTS</p>
            <h2>Tool schemas</h2>
            <p>
              Each canonical schema hash and observed metadata version is frozen
              when an intent is created.
            </p>
          </div>
          <span className="data-contract">{mech.tools.length} TOOLS</span>
        </header>
        {mech.tools.length ? (
          <div className="schema-stack">
            {mech.tools.map((tool) => (
              <details key={tool.schemaHash}>
                <summary>
                  <strong>{tool.name}</strong>
                  <span className="mono-copy">{short(tool.schemaHash)}</span>
                </summary>
                <p>{tool.description || "No operator description."}</p>
                <div className="schema-grid">
                  <div>
                    <span>INPUT SCHEMA</span>
                    <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                  </div>
                  <div>
                    <span>OUTPUT SCHEMA</span>
                    <pre>{JSON.stringify(tool.outputSchema, null, 2)}</pre>
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <StatePanel
            state={{
              status: "empty",
              message:
                "No compatible tool schema was published; this provider cannot be selected.",
            }}
          />
        )}
      </section>
    </div>
  );
}
