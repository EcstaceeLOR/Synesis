import { z } from "zod";

import {
  intentSchema,
  intentStateSchema,
  intentStateTransitionSchema,
  type Intent,
  type IntentState,
  type IntentStateTransition,
} from "./contracts.js";
import {
  IllegalStateTransitionError,
  InvalidTransitionMetadataError,
  TerminalStateMutationError,
} from "./errors.js";
import { hashCanonicalJson } from "./hashing.js";
import {
  actorSchema,
  isoTimestampSchema,
  traceIdSchema,
} from "./primitives.js";

export const TERMINAL_INTENT_STATES = [
  "SUCCEEDED",
  "REJECTED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
] as const satisfies readonly IntentState[];

const terminalStateSet = new Set<IntentState>(TERMINAL_INTENT_STATES);

export const ALLOWED_INTENT_TRANSITIONS = Object.freeze({
  DRAFT: ["QUOTING"],
  QUOTING: ["AWAITING_APPROVAL", "PROCUREMENT_READY"],
  AWAITING_APPROVAL: ["PROCUREMENT_READY", "CANCELLED"],
  PROCUREMENT_READY: ["PROCUREMENT_EXECUTING"],
  PROCUREMENT_EXECUTING: ["AWAITING_DELIVERIES", "FAILED", "UNCONFIRMED"],
  AWAITING_DELIVERIES: ["EVALUATING", "EXPIRED"],
  EVALUATING: ["REJECTED", "EXECUTION_READY"],
  REJECTED: [],
  EXECUTION_READY: ["AWAITING_FINAL_APPROVAL", "EXECUTING"],
  AWAITING_FINAL_APPROVAL: ["EXECUTING", "CANCELLED"],
  EXECUTING: ["SUCCEEDED", "FAILED", "UNCONFIRMED"],
  SUCCEEDED: [],
  FAILED: [],
  UNCONFIRMED: ["SUCCEEDED", "FAILED"],
  EXPIRED: [],
  CANCELLED: [],
} as const satisfies Readonly<Record<IntentState, readonly IntentState[]>>);

export const transitionCommandSchema = z
  .object({
    to: intentStateSchema,
    actor: actorSchema,
    reason: z.string().trim().min(1).max(1_000),
    traceId: traceIdSchema,
    occurredAt: isoTimestampSchema,
  })
  .strict();

export type TransitionCommand = z.infer<typeof transitionCommandSchema>;

export interface TransitionResult {
  readonly intent: Intent;
  readonly transition: IntentStateTransition;
}

export const isTerminalIntentState = (state: IntentState): boolean =>
  terminalStateSet.has(state);

export const canTransitionIntent = (
  from: IntentState,
  to: IntentState,
): boolean =>
  ALLOWED_INTENT_TRANSITIONS[from].some((candidate) => candidate === to);

export function assertIntentTransition(
  from: IntentState,
  to: IntentState,
): void {
  if (isTerminalIntentState(from)) {
    throw new TerminalStateMutationError(from, to);
  }
  if (!canTransitionIntent(from, to)) {
    throw new IllegalStateTransitionError(from, to);
  }
}

export async function transitionIntent(
  intentInput: Intent,
  commandInput: TransitionCommand,
): Promise<TransitionResult> {
  const intent = intentSchema.parse(intentInput);
  const command = transitionCommandSchema.parse(commandInput);

  assertIntentTransition(intent.state, command.to);

  if (command.traceId !== intent.traceId) {
    throw new InvalidTransitionMetadataError(
      "Transition trace ID must match the intent trace ID",
    );
  }
  if (Date.parse(command.occurredAt) < Date.parse(intent.updatedAt)) {
    throw new InvalidTransitionMetadataError(
      "Transition timestamp cannot precede the intent's latest update",
    );
  }

  const nextIntent = intentSchema.parse({
    ...intent,
    state: command.to,
    stateVersion: intent.stateVersion + 1,
    updatedAt: command.occurredAt,
  });
  const [beforeHash, afterHash] = await Promise.all([
    hashCanonicalJson(intent),
    hashCanonicalJson(nextIntent),
  ]);
  const transition = intentStateTransitionSchema.parse({
    schemaVersion: "1.0",
    intentId: intent.id,
    from: intent.state,
    to: command.to,
    fromVersion: intent.stateVersion,
    toVersion: nextIntent.stateVersion,
    actor: command.actor,
    reason: command.reason,
    traceId: command.traceId,
    occurredAt: command.occurredAt,
    beforeHash,
    afterHash,
  });

  return { intent: nextIntent, transition };
}
