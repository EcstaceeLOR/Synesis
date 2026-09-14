import type { IntentState } from "./contracts.js";

export type DomainErrorCode =
  | "ILLEGAL_STATE_TRANSITION"
  | "TERMINAL_STATE_IMMUTABLE"
  | "INVALID_TRANSITION_METADATA";

export abstract class DomainError extends Error {
  public abstract readonly code: DomainErrorCode;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class IllegalStateTransitionError extends DomainError {
  public readonly code = "ILLEGAL_STATE_TRANSITION" as const;

  public constructor(
    public readonly from: IntentState,
    public readonly to: IntentState,
  ) {
    super(`Intent cannot transition from ${from} to ${to}`);
  }
}

export class TerminalStateMutationError extends DomainError {
  public readonly code = "TERMINAL_STATE_IMMUTABLE" as const;

  public constructor(
    public readonly from: IntentState,
    public readonly attemptedState: IntentState,
  ) {
    super(
      `Terminal intent state ${from} is immutable; cannot transition to ${attemptedState}`,
    );
  }
}

export class InvalidTransitionMetadataError extends DomainError {
  public readonly code = "INVALID_TRANSITION_METADATA" as const;

  public constructor(message: string) {
    super(message);
  }
}
