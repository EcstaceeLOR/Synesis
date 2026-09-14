import { describe, expect, it } from "vitest";

import {
  ALLOWED_INTENT_TRANSITIONS,
  DomainError,
  IllegalStateTransitionError,
  INTENT_STATES,
  InvalidTransitionMetadataError,
  TERMINAL_INTENT_STATES,
  TerminalStateMutationError,
  canTransitionIntent,
  hashCanonicalJson,
  intentSchema,
  intentStateTransitionSchema,
  isTerminalIntentState,
  transitionIntent,
  type Intent,
  type IntentState,
} from "./index.js";

const ADDRESS_A = "0x1111111111111111111111111111111111111111";
const ADDRESS_B = "0x2222222222222222222222222222222222222222";
const SNAPSHOT_HASH = `sha256:${"a".repeat(64)}`;
const CREATED_AT = "2026-09-14T10:00:00.000Z";
const TRANSITIONED_AT = "2026-09-14T10:01:00.000Z";

const EXPECTED_ALLOWED_EDGES = [
  "DRAFT->QUOTING",
  "QUOTING->AWAITING_APPROVAL",
  "QUOTING->PROCUREMENT_READY",
  "AWAITING_APPROVAL->PROCUREMENT_READY",
  "AWAITING_APPROVAL->CANCELLED",
  "PROCUREMENT_READY->PROCUREMENT_EXECUTING",
  "PROCUREMENT_EXECUTING->AWAITING_DELIVERIES",
  "PROCUREMENT_EXECUTING->FAILED",
  "PROCUREMENT_EXECUTING->UNCONFIRMED",
  "AWAITING_DELIVERIES->EVALUATING",
  "AWAITING_DELIVERIES->EXPIRED",
  "EVALUATING->REJECTED",
  "EVALUATING->EXECUTION_READY",
  "EXECUTION_READY->AWAITING_FINAL_APPROVAL",
  "EXECUTION_READY->EXECUTING",
  "AWAITING_FINAL_APPROVAL->EXECUTING",
  "AWAITING_FINAL_APPROVAL->CANCELLED",
  "EXECUTING->SUCCEEDED",
  "EXECUTING->FAILED",
  "EXECUTING->UNCONFIRMED",
  "UNCONFIRMED->SUCCEEDED",
  "UNCONFIRMED->FAILED",
] as const;

const expectedAllowedEdgeSet = new Set<string>(EXPECTED_ALLOWED_EDGES);

const makeIntent = (state: IntentState): Intent =>
  intentSchema.parse({
    schemaVersion: "1.0",
    id: "intent-1",
    organizationId: "organization-1",
    traceId: "trace-1",
    state,
    stateVersion: 7,
    strategy: "AAVE_V3_USDC_SUPPLY",
    asset: "USDC",
    chainId: 8453,
    amountBaseUnits: "1000000",
    policyVersionId: "policy-1",
    selectedMechs: [ADDRESS_A, ADDRESS_B],
    snapshotHash: SNAPSHOT_HASH,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    expiresAt: "2026-09-14T11:00:00.000Z",
  });

const transitionCommand = (to: IntentState) => ({
  to,
  actor: { type: "WORKER" as const, id: "coordinator-1" },
  reason: `Advance to ${to}`,
  traceId: "trace-1",
  occurredAt: TRANSITIONED_AT,
});

describe("intent state machine", () => {
  it("represents every architecture state and all 22 legal edges", () => {
    expect(INTENT_STATES).toHaveLength(16);
    expect(Object.keys(ALLOWED_INTENT_TRANSITIONS).sort()).toEqual(
      [...INTENT_STATES].sort(),
    );
    expect(
      Object.entries(ALLOWED_INTENT_TRANSITIONS)
        .flatMap(([from, destinations]) =>
          destinations.map((to) => `${from}->${to}`),
        )
        .sort(),
    ).toEqual([...EXPECTED_ALLOWED_EDGES].sort());
    expect(TERMINAL_INTENT_STATES).toEqual([
      "SUCCEEDED",
      "REJECTED",
      "FAILED",
      "EXPIRED",
      "CANCELLED",
    ]);
  });

  it("covers every allowed and rejected pair in the complete 16 by 16 table", async () => {
    let accepted = 0;
    let rejected = 0;

    for (const from of INTENT_STATES) {
      for (const to of INTENT_STATES) {
        const expected = expectedAllowedEdgeSet.has(`${from}->${to}`);
        expect(canTransitionIntent(from, to), `${from} -> ${to}`).toBe(
          expected,
        );

        if (expected) {
          const original = makeIntent(from);
          const result = await transitionIntent(
            original,
            transitionCommand(to),
          );

          expect(result.intent.state, `${from} -> ${to}`).toBe(to);
          expect(result.intent.stateVersion).toBe(original.stateVersion + 1);
          expect(result.intent.updatedAt).toBe(TRANSITIONED_AT);
          expect(original.state).toBe(from);
          expect(
            intentStateTransitionSchema.safeParse(result.transition).success,
          ).toBe(true);
          expect(result.transition).toMatchObject({
            intentId: original.id,
            from,
            to,
            actor: transitionCommand(to).actor,
            reason: transitionCommand(to).reason,
            traceId: original.traceId,
            occurredAt: TRANSITIONED_AT,
          });
          expect(result.transition.beforeHash).toBe(
            await hashCanonicalJson(original),
          );
          expect(result.transition.afterHash).toBe(
            await hashCanonicalJson(result.intent),
          );
          expect(result.transition.beforeHash).not.toBe(
            result.transition.afterHash,
          );
          accepted += 1;
        } else {
          const error = await transitionIntent(
            makeIntent(from),
            transitionCommand(to),
          ).catch((caught: unknown) => caught);

          expect(error, `${from} -> ${to}`).toBeInstanceOf(DomainError);
          expect(error, `${from} -> ${to}`).toBeInstanceOf(
            isTerminalIntentState(from)
              ? TerminalStateMutationError
              : IllegalStateTransitionError,
          );
          rejected += 1;
        }
      }
    }

    expect(accepted).toBe(22);
    expect(rejected).toBe(234);
  });

  it("keeps terminal states immutable even when the requested state is unchanged", async () => {
    for (const terminalState of TERMINAL_INTENT_STATES) {
      await expect(
        transitionIntent(
          makeIntent(terminalState),
          transitionCommand(terminalState),
        ),
      ).rejects.toMatchObject({
        code: "TERMINAL_STATE_IMMUTABLE",
        from: terminalState,
        attemptedState: terminalState,
      });
    }
  });

  it("rejects a trace ID that breaks lifecycle correlation", async () => {
    await expect(
      transitionIntent(makeIntent("DRAFT"), {
        ...transitionCommand("QUOTING"),
        traceId: "different-trace",
      }),
    ).rejects.toBeInstanceOf(InvalidTransitionMetadataError);
  });

  it("rejects a transition timestamp older than the persisted intent", async () => {
    await expect(
      transitionIntent(makeIntent("DRAFT"), {
        ...transitionCommand("QUOTING"),
        occurredAt: "2026-09-14T09:59:59.000Z",
      }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION_METADATA" });
  });
});
