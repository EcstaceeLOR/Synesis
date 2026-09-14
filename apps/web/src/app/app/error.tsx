"use client";

import { StatePanel } from "@synesis/ui";

export default function ApplicationError({
  reset,
}: {
  readonly reset: () => void;
}) {
  return (
    <div className="content-shell">
      <StatePanel
        state={{
          status: "error",
          message: "This workspace view could not be rendered.",
        }}
      />
      <button className="primary-action" type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
