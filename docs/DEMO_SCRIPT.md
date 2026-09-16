# Synesis judge demo (under four minutes)

Use the deployed demo environment in `SYNESIS_MODE=demo` for rehearsal. For
the final recording, replace the demo evidence IDs with the verified low-value
Base acceptance report and never narrate a transaction as successful from an
HTTP response alone.

| Time      | Surface          | Demonstration                                                                                                                                                                           |
| --------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:25 | Command center   | Show KeeperHub treasury, active intents, proof count, and the live activity stream. Explain that Synesis moves value only after paid intelligence and policy checks.                    |
| 0:25–0:55 | Mech marketplace | Open Mechs and show two independent Olas providers, their delivery history, tool-schema hashes, and eligibility reasons.                                                                |
| 0:55–1:25 | New intent       | Create the Base/USDC Aave supply intent, enter the bounded amount, and show validation, expiry, and the maximum possible spend.                                                         |
| 1:25–2:05 | Intent Room      | Open `SYN-1042`, show the frozen snapshot, two paid Olas deliveries, deterministic quorum, and the approval boundary. Refresh once to demonstrate durable state.                        |
| 2:05–2:40 | Execution ledger | Approve once, show the idempotent action result, then open the execution detail with KeeperHub execution ID, receipt status, manifest, and Base explorer link.                          |
| 2:40–3:15 | Proof verifier   | Open the public proof URL, download the canonical JSON, and independently verify the ordered proof root and every source link.                                                          |
| 3:15–3:45 | Replay + safety  | Repeat the approval/replay attempt. Show the recorded replay rejection and unchanged treasury/position delta. End on the integrations and security pages, highlighting live-mode gates. |

## Evidence card

Before recording, fill this card from the accepted report; do not use invented
values or fixture transaction hashes:

```text
KeeperHub Olas execution IDs:  __________________ / __________________
Olas delivery hashes:           __________________ / __________________
KeeperHub Aave execution ID:    __________________
Base transaction links:         __________________ / __________________ / __________________
Observed Aave position delta:   __________________
Public proof URL + root:        __________________
Replay event + value moved:     __________________ / false
```

Keep the recording focused on the cross-project value loop: Olas triggers the
decision, KeeperHub pays and executes, Aave receives the bounded position
change, and the proof verifier makes the whole chain independently inspectable.
