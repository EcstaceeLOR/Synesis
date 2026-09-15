"use client";

import { useState } from "react";

export function IntentRoomActions({ intentId }: { readonly intentId: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="page-actions" aria-label="Intent actions">
      <button
        className="primary-action"
        type="button"
        onClick={() => setMessage(`Approval recorded for ${intentId}`)}
      >
        Approve execution
      </button>
      <button
        className="secondary-action"
        type="button"
        onClick={() => setMessage("Intent cancellation requires confirmation")}
      >
        Cancel intent
      </button>
      {message ? <small aria-live="polite">{message}</small> : null}
    </div>
  );
}
