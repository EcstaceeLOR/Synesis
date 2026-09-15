"use client";

import {
  freezeMechSelections,
  type FrozenMechSelectionBundle,
  type MechDirectory,
} from "@synesis/domain";
import { StatePanel, StatusBadge, type ViewState } from "@synesis/ui";
import Link from "next/link";
import { useState } from "react";

export function IntentMechSelector({
  state,
}: {
  readonly state: ViewState<MechDirectory>;
}) {
  const eligible =
    state.data?.mechs.filter((mech) => mech.eligible && mech.tools.length) ??
    [];
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [snapshot, setSnapshot] = useState<FrozenMechSelectionBundle>();
  const selectedMaximum = selected.reduce((total, address) => {
    const mech = eligible.find((item) => item.address === address);
    return total + (mech?.unitAmount ?? 0);
  }, 0);
  const toggle = (address: string) =>
    setSelected((current) =>
      current.includes(address)
        ? current.filter((item) => item !== address)
        : current.length < 2
          ? [...current, address]
          : current,
    );
  const freeze = () => {
    const selections = selected.map((address) => {
      const mech = eligible.find((item) => item.address === address)!;
      return { mechAddress: address, tool: mech.tools[0]!.name };
    });
    void freezeMechSelections(state.data, selections).then(setSnapshot);
  };
  return (
    <section className="data-section intent-selector">
      <header>
        <div>
          <p className="section-index">// STEP 02 / INTELLIGENCE</p>
          <h2>Select two independent Mechs</h2>
          <p>
            Only live providers that passed contract, signer, payment, schema,
            chain, and activity checks are selectable.
          </p>
        </div>
        <span className="data-contract">{selected.length} / 2 SELECTED</span>
      </header>
      {state.status !== "ready" ? (
        <StatePanel state={state} compact={Boolean(state.data)} />
      ) : null}
      {eligible.length < 2 ? (
        <div className="selection-blocked">
          <StatePanel
            state={{
              status: "rejected",
              message: `Only ${eligible.length} eligible independent Mech${eligible.length === 1 ? " is" : "s are"} live; Synesis requires two and will not invent a fallback.`,
            }}
          />
          <Link className="secondary-action" href="/app/mechs">
            Inspect marketplace evidence
          </Link>
        </div>
      ) : (
        <div className="selector-grid">
          {eligible.map((mech) => (
            <label
              key={mech.address}
              htmlFor={`mech-${mech.serviceId}`}
              className={
                selected.includes(mech.address)
                  ? "selector-card is-selected"
                  : "selector-card"
              }
            >
              <input
                id={`mech-${mech.serviceId}`}
                type="checkbox"
                aria-label={`Select ${mech.name}, service ${mech.serviceId}`}
                checked={selected.includes(mech.address)}
                onChange={() => toggle(mech.address)}
                disabled={
                  !selected.includes(mech.address) && selected.length >= 2
                }
              />
              <span>
                <strong>{mech.name}</strong>
                <small>
                  Service #{mech.serviceId} · {mech.totalDeliveries} deliveries
                </small>
                <span className="mono-copy">{mech.address}</span>
                <small className="mono-copy">
                  Maximum procurement:{" "}
                  {mech.unitAmount === null
                    ? "quote required"
                    : mech.unitAmount.toLocaleString()}{" "}
                  base units
                </small>
                <StatusBadge tone="positive">{mech.tools[0]!.name}</StatusBadge>
              </span>
            </label>
          ))}
        </div>
      )}
      {eligible.length >= 2 ? (
        <div className="freeze-bar">
          <div>
            <span>IMMUTABLE DIRECTORY SNAPSHOT</span>
            <strong>
              {snapshot?.snapshotHash ?? "Select exactly two providers"}
            </strong>
            <small>
              {snapshot
                ? "Addresses, metadata CIDs, tool schema hashes, and observed versions are bound."
                : "Selection is revalidated server-side when the intent is persisted."}
            </small>
            {selected.length > 0 ? (
              <small className="mono-copy">
                APPROVED MAXIMUM: {selectedMaximum.toLocaleString()} base units
                (exact bounded approval)
              </small>
            ) : null}
          </div>
          <button
            className="primary-action"
            type="button"
            disabled={selected.length !== 2}
            onClick={freeze}
          >
            Approve &amp; freeze maximum
          </button>
        </div>
      ) : null}
      {snapshot ? (
        <div className="frozen-grid">
          {snapshot.selections.map((item) => (
            <article key={item.mechAddress}>
              <span>
                SERVICE #{item.serviceId} / {item.tool}
              </span>
              <strong className="mono-copy">{item.metadataCid}</strong>
              <small className="mono-copy">{item.toolSchemaHash}</small>
              <small>{item.observedVersion}</small>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
