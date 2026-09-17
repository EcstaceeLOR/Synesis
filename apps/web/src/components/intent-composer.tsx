"use client";

import { freezeMechSelections, type MechDirectory } from "@synesis/domain";
import { StatusBadge } from "@synesis/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

interface CreatedIntent {
  readonly intent: {
    readonly id: string;
    readonly state: string;
    readonly amount: string;
    readonly snapshotHash: string;
  };
  readonly next: string;
  readonly message: string;
}

export function IntentComposer({
  directory,
}: {
  readonly directory: MechDirectory;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("1000000");
  const [expiryHours, setExpiryHours] = useState(24);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const eligible = useMemo(
    () =>
      directory.mechs.filter((mech) => mech.eligible && mech.tools.length > 0),
    [directory.mechs],
  );
  const validAmount =
    /^[1-9]\d*$/u.test(amount) && BigInt(amount || "0") <= 10_000_000_000n;
  const procurementMaximum = selected.reduce((total, address) => {
    const mech = eligible.find((candidate) => candidate.address === address);
    return total + (mech?.unitAmount ?? 0);
  }, 0);

  useEffect(() => {
    const saved = window.localStorage.getItem("synesis.intent.draft");
    if (!saved) return;
    try {
      const draft = JSON.parse(saved) as {
        amount?: string;
        expiryHours?: number;
        selected?: readonly string[];
      };
      setAmount(draft.amount ?? "1000000");
      setExpiryHours(draft.expiryHours ?? 24);
      setSelected(draft.selected ?? []);
    } catch {
      window.localStorage.removeItem("synesis.intent.draft");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "synesis.intent.draft",
      JSON.stringify({ amount, expiryHours, selected }),
    );
  }, [amount, expiryHours, selected]);

  const toggle = (address: string) => {
    setSelected((current) =>
      current.includes(address)
        ? current.filter((item) => item !== address)
        : current.length < 2
          ? [...current, address]
          : current,
    );
  };

  const submit = () => {
    setError("");
    startTransition(async () => {
      try {
        const selections = selected.map((address) => {
          const mech = eligible.find(
            (candidate) => candidate.address === address,
          );
          if (!mech?.tools[0]) throw new Error("Selected Mech is unavailable.");
          return { mechAddress: address, tool: mech.tools[0].name };
        });
        const frozenMechs = await freezeMechSelections(directory, selections);
        const response = await fetch("/api/v1/intents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            amount,
            expiryHours,
            mechAddresses: selected,
          }),
        });
        const payload = (await response.json()) as CreatedIntent & {
          error?: { message?: string };
        };
        if (!response.ok)
          throw new Error(payload.error?.message ?? "Intent creation failed.");
        window.localStorage.setItem(
          `synesis.intent.${payload.intent.id}`,
          JSON.stringify({
            ...payload.intent,
            frozenMechs,
            createdFrom: "interactive-wizard",
          }),
        );
        window.localStorage.removeItem("synesis.intent.draft");
        router.push(`${payload.next}?created=1`);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Intent creation failed safely.",
        );
      }
    });
  };

  return (
    <section
      className="data-section intent-composer"
      aria-labelledby="compose-heading"
    >
      <header>
        <div>
          <p className="section-index">// INTERACTIVE INTENT BUILDER</p>
          <h2 id="compose-heading">Freeze a bounded decision request</h2>
          <p>
            Define exposure, choose exactly two independent agents, review the
            maximum cost, then persist the immutable snapshot through the
            Synesis backend.
          </p>
        </div>
        <span className="data-contract">BASE · USDC · AAVE V3</span>
      </header>

      <div className="composer-steps" aria-label="Intent steps">
        <span className="is-active">01 Exposure</span>
        <span className={validAmount ? "is-active" : ""}>02 Intelligence</span>
        <span className={selected.length === 2 ? "is-active" : ""}>
          03 Review
        </span>
      </div>

      <div className="selector-grid">
        <label className="selector-card">
          <span>
            <strong>USDC amount</strong>
            <small>Base units; capped at 10,000 USDC</small>
          </span>
          <input
            aria-label="Amount"
            inputMode="numeric"
            value={amount}
            onChange={(event) =>
              setAmount(event.currentTarget.value.replace(/\D/gu, ""))
            }
          />
        </label>
        <label className="selector-card">
          <span>
            <strong>Expiry</strong>
            <small>Stale intent protection</small>
          </span>
          <select
            aria-label="Expiry"
            value={expiryHours}
            onChange={(event) =>
              setExpiryHours(Number(event.currentTarget.value))
            }
          >
            <option value={1}>1 hour</option>
            <option value={24}>24 hours</option>
            <option value={72}>72 hours</option>
          </select>
        </label>
      </div>

      <div className="composer-agent-grid">
        {eligible.map((mech) => {
          const checked = selected.includes(mech.address);
          return (
            <label
              className={`agent-choice${checked ? " is-selected" : ""}`}
              key={mech.address}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && selected.length >= 2}
                onChange={() => toggle(mech.address)}
              />
              <span className="agent-choice-copy">
                <strong>{mech.name}</strong>
                <small>
                  Service #{mech.serviceId} ·{" "}
                  {mech.totalDeliveries.toLocaleString()} deliveries
                </small>
                <small>{mech.tools[0]?.name}</small>
              </span>
              <StatusBadge tone="positive">
                {mech.compatibilityScore}% fit
              </StatusBadge>
            </label>
          );
        })}
      </div>

      <div className="launch-review">
        <div>
          <span>MAXIMUM EXPOSURE</span>
          <strong>
            {validAmount
              ? `${Number(amount).toLocaleString()} USDC base units`
              : "Invalid amount"}
          </strong>
          <small>
            Agent procurement cap: {procurementMaximum.toLocaleString()} base
            units · no broadcast occurs in demo mode
          </small>
        </div>
        <button
          className="primary-action"
          type="button"
          disabled={!validAmount || selected.length !== 2 || isPending}
          onClick={submit}
        >
          {isPending ? "Freezing snapshot…" : "Freeze & create intent"}
        </button>
      </div>
      {error ? (
        <p className="action-notice is-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
