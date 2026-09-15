"use client";

import { useEffect, useState } from "react";

export function LiveActivityStream() {
  const [status, setStatus] = useState<"connecting" | "live" | "polling">(
    "connecting",
  );
  const [lastEvent, setLastEvent] = useState("Waiting for lifecycle events");
  useEffect(() => {
    const source = new EventSource("/api/activity/stream");
    source.onopen = () => setStatus("live");
    source.onmessage = (event) => {
      try {
        const value: unknown = JSON.parse(String(event.data));
        const message =
          typeof value === "object" &&
          value !== null &&
          "message" in value &&
          typeof value.message === "string"
            ? value.message
            : undefined;
        setLastEvent(message ?? "New Synesis lifecycle event");
      } catch {
        setLastEvent("New Synesis lifecycle event");
      }
    };
    source.onerror = () => {
      setStatus("polling");
      source.close();
    };
    const fallback = window.setInterval(() => {
      if (source.readyState === EventSource.CLOSED) {
        void fetch("/api/activity")
          .then((response) => {
            if (response.ok)
              setLastEvent("Activity refreshed from persisted records");
          })
          .catch(() => undefined);
      }
    }, 15_000);
    return () => {
      source.close();
      window.clearInterval(fallback);
    };
  }, []);
  return (
    <div className="data-contract" aria-live="polite">
      {status === "live"
        ? "● LIVE STREAM"
        : status === "polling"
          ? "↻ POLLING FALLBACK"
          : "○ CONNECTING"}{" "}
      · {lastEvent}
    </div>
  );
}
