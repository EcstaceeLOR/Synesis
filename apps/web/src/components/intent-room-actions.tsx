"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

export function IntentRoomActions({ intentId }: { readonly intentId: string }) {
  const [message, setMessage] = useState("Ready for an idempotent decision.");
  const [state, setState] = useState("AWAITING_APPROVAL");
  const [simulationHash, setSimulationHash] = useState("");
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    const saved = window.localStorage.getItem(`synesis.intent.${intentId}`);
    if (!saved) return;
    try {
      const intent = JSON.parse(saved) as { state?: string };
      setState(intent.state ?? "AWAITING_APPROVAL");
      setMessage("Immutable intent snapshot restored from this browser.");
    } catch {
      window.localStorage.removeItem(`synesis.intent.${intentId}`);
    }
  }, [intentId]);

  const persistState = (nextState: string) => {
    setState(nextState);
    const key = `synesis.intent.${intentId}`;
    const saved = window.localStorage.getItem(key);
    const value = saved
      ? (JSON.parse(saved) as Record<string, unknown>)
      : { id: intentId };
    window.localStorage.setItem(
      key,
      JSON.stringify({ ...value, state: nextState }),
    );
  };

  const decide = (decision: "approve" | "reject") => {
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/v1/intents/${encodeURIComponent(intentId)}/approval`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ decision }),
          },
        );
        const payload = (await response.json()) as {
          state?: string;
          message?: string;
        };
        if (!response.ok || !payload.state) {
          setMessage("The backend rejected the decision safely.");
          return;
        }
        persistState(payload.state);
        setMessage(payload.message ?? "Decision recorded.");
      } catch {
        setMessage("The backend is unreachable. No decision was recorded.");
      }
    });
  };

  const simulate = () => {
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/v1/intents/${encodeURIComponent(intentId)}/simulate`,
          { method: "POST" },
        );
        const payload = (await response.json()) as {
          simulationHash?: string;
          message?: string;
        };
        if (!response.ok || !payload.simulationHash) {
          setMessage("Simulation failed closed; nothing was broadcast.");
          return;
        }
        setSimulationHash(payload.simulationHash);
        setMessage(payload.message ?? "Simulation passed.");
      } catch {
        setMessage("Simulation service is unreachable; nothing was broadcast.");
      }
    });
  };

  return (
    <section className="intent-control-bar" aria-label="Intent actions">
      <div>
        <span>CURRENT STATE</span>
        <strong>{state}</strong>
        <small aria-live="polite">{message}</small>
        {simulationHash ? <code>{simulationHash}</code> : null}
      </div>
      <div className="intent-control-actions">
        <button
          className="secondary-action"
          disabled={isPending}
          type="button"
          onClick={simulate}
        >
          Simulate exact call
        </button>
        <button
          className="primary-action"
          disabled={isPending || state === "CANCELLED"}
          type="button"
          onClick={() => decide("approve")}
        >
          Approve execution
        </button>
        <button
          className="danger-action"
          disabled={isPending || state === "CANCELLED"}
          type="button"
          onClick={() => decide("reject")}
        >
          Cancel intent
        </button>
        <Link className="secondary-action" href="/verify/PRF-1041">
          Open proof
        </Link>
      </div>
    </section>
  );
}
