"use client";

import { useEffect, useState } from "react";

interface ApiStatus {
  readonly status: string;
  readonly environment: string;
  readonly version: string;
  readonly capabilities: Readonly<Record<string, boolean>>;
}

export function SystemPulse() {
  const [status, setStatus] = useState<ApiStatus>();
  const [error, setError] = useState(false);
  useEffect(() => {
    void fetch("/api/v1/status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("API unavailable");
        setStatus((await response.json()) as ApiStatus);
      })
      .catch(() => setError(true));
  }, []);
  return (
    <aside
      className={`system-pulse${error ? " is-error" : ""}`}
      aria-live="polite"
    >
      <span className="pulse-dot" aria-hidden="true" />
      <div>
        <strong>
          {error
            ? "BACKEND UNAVAILABLE"
            : status
              ? "BACKEND CONNECTED"
              : "CONNECTING BACKEND"}
        </strong>
        <small>
          {status
            ? `${status.environment.toUpperCase()} · API ${status.version} · ${Object.values(status.capabilities).filter(Boolean).length} capabilities ready`
            : "Checking the deployed API boundary…"}
        </small>
      </div>
      {status ? (
        <a href="/api/v1/status" target="_blank" rel="noreferrer">
          Inspect JSON ↗
        </a>
      ) : null}
    </aside>
  );
}
