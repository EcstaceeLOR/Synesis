"use client";

import { useEffect, useState } from "react";

export function IntentWizardForm() {
  const [amount, setAmount] = useState("");
  const [expiry, setExpiry] = useState("24");
  useEffect(() => {
    const saved = window.localStorage.getItem("synesis.intent.draft");
    if (saved) {
      const draft = JSON.parse(saved) as { amount?: string; expiry?: string };
      setAmount(draft.amount ?? "");
      setExpiry(draft.expiry ?? "24");
    }
  }, []);
  useEffect(() => {
    window.localStorage.setItem(
      "synesis.intent.draft",
      JSON.stringify({ amount, expiry }),
    );
  }, [amount, expiry]);
  const valid =
    /^\d+$/.test(amount) &&
    Number(amount) > 0 &&
    Number(amount) <= 10_000_000_000;
  return (
    <section className="data-section">
      <header>
        <div>
          <p className="section-index">// STEP 01 / EXPOSURE</p>
          <h2>Define a bounded USDC intent</h2>
          <p>
            Draft state survives refresh and is revalidated against the active
            policy at confirmation.
          </p>
        </div>
        <span className="data-contract">BASE / USDC ONLY</span>
      </header>
      <div className="selector-grid">
        <label className="selector-card">
          <span>
            <strong>Strategy</strong>
            <small>AAVE V3 USDC SUPPLY · fixed allowlist</small>
          </span>
          <select aria-label="Strategy" disabled>
            <option>AAVE_V3_USDC_SUPPLY</option>
          </select>
        </label>
        <label className="selector-card">
          <span>
            <strong>Amount (base units)</strong>
            <small>Maximum exposure, never an estimate</small>
          </span>
          <input
            aria-label="Amount"
            inputMode="numeric"
            value={amount}
            onChange={(event) =>
              setAmount(event.target.value.replace(/\D/g, ""))
            }
            placeholder="e.g. 1000000"
          />
        </label>
        <label className="selector-card">
          <span>
            <strong>Expiry</strong>
            <small>Draft expires automatically</small>
          </span>
          <select
            aria-label="Expiry"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
          >
            <option value="1">1 hour</option>
            <option value="24">24 hours</option>
            <option value="72">72 hours</option>
          </select>
        </label>
      </div>
      <div className="freeze-bar">
        <div>
          <span>EXPOSURE REVIEW</span>
          <strong>
            {valid
              ? `${Number(amount).toLocaleString()} base units maximum`
              : "Enter a positive amount within policy cap"}
          </strong>
          <small>
            {valid
              ? "Next: select two independent live Mechs and freeze their quote."
              : "Unsupported chains, assets, and amounts are blocked before submission."}
          </small>
        </div>
        <span className={valid ? "data-contract" : "data-contract is-warning"}>
          {valid ? "VALIDATED" : "WAITING"}
        </span>
      </div>
    </section>
  );
}
