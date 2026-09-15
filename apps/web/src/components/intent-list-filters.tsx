"use client";

import { useState } from "react";

export function IntentListFilters() {
  const [query, setQuery] = useState("");
  return (
    <div className="data-section">
      <header>
        <div>
          <p className="section-index">// FILTERS</p>
          <h2>Find an intent</h2>
        </div>
        <span className="data-contract">PERSISTED LIFECYCLE</span>
      </header>
      <div className="selector-grid">
        <input
          aria-label="Search intents"
          placeholder="Search ID or strategy"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select aria-label="Lifecycle state">
          <option>All states</option>
          <option>PROCUREMENT_READY</option>
          <option>SUCCEEDED</option>
          <option>UNCONFIRMED</option>
        </select>
        <select aria-label="Environment">
          <option>All environments</option>
          <option>live</option>
          <option>demo</option>
        </select>
      </div>
      {query ? (
        <small className="mono-copy">Filtering ledger for “{query}”</small>
      ) : null}
    </div>
  );
}
