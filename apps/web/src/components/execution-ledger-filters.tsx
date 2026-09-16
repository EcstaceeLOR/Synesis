"use client";

import { useState } from "react";

export function ExecutionLedgerFilters() {
  const [purpose, setPurpose] = useState("all");
  return (
    <section className="data-section">
      <header>
        <div>
          <p className="section-index">// LEDGER FILTERS</p>
          <h2>KeeperHub economic actions</h2>
        </div>
        <span className="data-contract">NO CREDENTIAL FIELDS</span>
      </header>
      <div className="selector-grid">
        <select
          aria-label="Execution purpose"
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
        >
          <option value="all">All purposes</option>
          <option>OLAS_REQUEST</option>
          <option>AAVE_APPROVAL</option>
          <option>AAVE_SUPPLY</option>
        </select>
        <select aria-label="Execution outcome">
          <option>All outcomes</option>
          <option>VERIFIED_SUCCESS</option>
          <option>UNCONFIRMED</option>
          <option>FAILED</option>
        </select>
      </div>
      <small className="mono-copy">
        Showing {purpose === "all" ? "all allowlisted actions" : purpose}
      </small>
    </section>
  );
}

export function ChainFreshness({
  label = "Base RPC",
}: {
  readonly label?: string;
}) {
  return (
    <div className="data-contract" aria-live="polite">
      {label} · VERIFIED BLOCK · FRESH &lt; 30s
    </div>
  );
}
