"use client";

import { useEffect, useState, useTransition } from "react";

export function SecurityControls() {
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState("Write controls are active.");
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    setPaused(window.localStorage.getItem("synesis.security.paused") === "1");
  }, []);
  const update = (next: boolean) => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/v1/security/pause", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ paused: next }),
        });
        const payload = (await response.json()) as {
          paused?: boolean;
          message?: string;
        };
        if (!response.ok || typeof payload.paused !== "boolean") {
          setMessage("The backend rejected the control change.");
          return;
        }
        setPaused(payload.paused);
        window.localStorage.setItem(
          "synesis.security.paused",
          payload.paused ? "1" : "0",
        );
        setMessage(payload.message ?? "Security state updated.");
      } catch {
        setMessage(
          "The backend is unreachable. The previous safety state remains active.",
        );
      }
    });
  };
  return (
    <section
      className={`emergency-control${paused ? " is-paused" : ""}`}
      aria-labelledby="emergency-heading"
    >
      <div>
        <p className="section-index">// EMERGENCY CONTROL</p>
        <h2 id="emergency-heading">
          {paused ? "Economic writes paused" : "Execution boundary armed"}
        </h2>
        <p aria-live="polite">{message}</p>
      </div>
      <button
        className={paused ? "primary-action" : "danger-action"}
        type="button"
        disabled={isPending}
        onClick={() => update(!paused)}
      >
        {isPending
          ? "Applying…"
          : paused
            ? "Resume bounded writes"
            : "Pause all writes"}
      </button>
    </section>
  );
}
