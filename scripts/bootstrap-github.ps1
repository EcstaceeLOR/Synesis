[CmdletBinding()]
param(
    [string]$Owner = "EcstaceeLOR",
    [string]$Repository = "Synesis"
)

$ErrorActionPreference = "Stop"
$apiRoot = "https://api.github.com/repos/$Owner/$Repository"

function Get-GitHubHeaders {
    $credentialInput = "protocol=https`nhost=github.com`n`n"
    $credentialLines = $credentialInput | git credential fill
    $passwordLine = $credentialLines |
        Where-Object { $_ -like "password=*" } |
        Select-Object -First 1

    if (-not $passwordLine) {
        throw "No GitHub credential was returned by Git Credential Manager."
    }

    $token = $passwordLine.Substring(9)
    return @{
        Authorization          = "Bearer $token"
        Accept                 = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
        "User-Agent"           = "Synesis-Repository-Bootstrap"
    }
}

$headers = Get-GitHubHeaders
$script:labelIndex = @{}
$script:issueIndex = @{}

function Invoke-GitHub {
    param(
        [Parameter(Mandatory)] [ValidateSet("GET", "POST", "PATCH")] [string]$Method,
        [Parameter(Mandatory)] [string]$Uri,
        [object]$Body
    )

    $parameters = @{
        Method  = $Method
        Uri     = $Uri
        Headers = $headers
    }

    if ($null -ne $Body) {
        $parameters.Body = $Body | ConvertTo-Json -Depth 20
        $parameters.ContentType = "application/json"
    }

    return Invoke-RestMethod @parameters
}

function Ensure-Label {
    param(
        [Parameter(Mandatory)] [string]$Name,
        [Parameter(Mandatory)] [string]$Color,
        [Parameter(Mandatory)] [string]$Description
    )

    $encodedName = [uri]::EscapeDataString($Name)
    $existing = $script:labelIndex[$Name]
    if ($existing) {
        $updated = Invoke-GitHub -Method PATCH -Uri "$apiRoot/labels/$encodedName" -Body @{
            name        = $Name
            color       = $Color
            description = $Description
        }
        $script:labelIndex[$Name] = $updated
        return $updated
    }

    $created = Invoke-GitHub -Method POST -Uri "$apiRoot/labels" -Body @{
        name        = $Name
        color       = $Color
        description = $Description
    }
    $script:labelIndex[$Name] = $created
    return $created
}

function Ensure-Milestone {
    param([Parameter(Mandatory)] [string]$Title)

    $milestones = Invoke-GitHub -Method GET -Uri "$apiRoot/milestones?state=all&per_page=100"
    $existing = $milestones | Where-Object { $_.title -eq $Title } | Select-Object -First 1
    $body = @{
        title       = $Title
        description = "Ship and prove the complete Synesis Olas -> KeeperHub -> Aave production journey."
        state       = "open"
        due_on      = "2026-09-18T10:00:00Z"
    }

    if ($existing) {
        return Invoke-GitHub -Method PATCH -Uri "$apiRoot/milestones/$($existing.number)" -Body $body
    }

    return Invoke-GitHub -Method POST -Uri "$apiRoot/milestones" -Body $body
}

function Ensure-Issue {
    param(
        [Parameter(Mandatory)] [string]$Title,
        [Parameter(Mandatory)] [string]$Body,
        [Parameter(Mandatory)] [string[]]$Labels,
        [Parameter(Mandatory)] [int]$Milestone
    )

    $existing = $script:issueIndex[$Title]

    $payload = @{
        title     = $Title
        body      = $Body
        labels    = $Labels
        milestone = $Milestone
    }

    if ($existing) {
        $updated = Invoke-GitHub -Method PATCH -Uri "$apiRoot/issues/$($existing.number)" -Body $payload
        $script:issueIndex[$Title] = $updated
        return $updated
    }

    $created = Invoke-GitHub -Method POST -Uri "$apiRoot/issues" -Body $payload
    $script:issueIndex[$Title] = $created
    return $created
}

$existingLabels = Invoke-GitHub -Method GET -Uri "$apiRoot/labels?per_page=100"
foreach ($existingLabel in $existingLabels) {
    $script:labelIndex[$existingLabel.name] = $existingLabel
}

$existingIssues = Invoke-GitHub -Method GET -Uri "$apiRoot/issues?state=all&per_page=100"
foreach ($existingIssue in $existingIssues) {
    if ($null -eq $existingIssue.pull_request) {
        $script:issueIndex[$existingIssue.title] = $existingIssue
    }
}

$labels = @(
    @{ Name = "type: epic"; Color = "5319E7"; Description = "Umbrella outcome spanning multiple implementation issues" },
    @{ Name = "area: foundation"; Color = "0E8A16"; Description = "Repository, domain, database, and core platform foundation" },
    @{ Name = "area: frontend"; Color = "1D76DB"; Description = "Interactive web product and user experience" },
    @{ Name = "area: backend"; Color = "0052CC"; Description = "API, workers, persistence, and orchestration" },
    @{ Name = "area: keeperhub"; Color = "008672"; Description = "KeeperHub API, MCP, workflow, execution, and receipt integration" },
    @{ Name = "area: olas"; Color = "6F42C1"; Description = "Olas Mech discovery, payment, request, and delivery integration" },
    @{ Name = "area: policy"; Color = "D4C5F9"; Description = "Deterministic quorum, approvals, and limits" },
    @{ Name = "area: proof"; Color = "BFD4F2"; Description = "Evidence capture, hashing, and public verification" },
    @{ Name = "area: security"; Color = "B60205"; Description = "Security controls and threat mitigations" },
    @{ Name = "area: observability"; Color = "006B75"; Description = "Logs, traces, metrics, alerts, and health" },
    @{ Name = "area: devops"; Color = "4E525A"; Description = "Containers, CI/CD, deployment, and operations" },
    @{ Name = "area: testing"; Color = "FBCA04"; Description = "Unit, contract, integration, and end-to-end tests" },
    @{ Name = "documentation"; Color = "0075CA"; Description = "Documentation, runbooks, demos, and submission materials" },
    @{ Name = "priority: p0"; Color = "B60205"; Description = "Required for the live winning product path" },
    @{ Name = "priority: p1"; Color = "D93F0B"; Description = "Important product completeness or hardening work" },
    @{ Name = "priority: p2"; Color = "FBCA04"; Description = "Valuable work after the core live path" }
)

foreach ($label in $labels) {
    Ensure-Label @label | Out-Null
}

$milestone = Ensure-Milestone -Title "Hackathon MVP"

$epic = Ensure-Issue `
    -Title "[EPIC] Ship the complete live Synesis product" `
    -Body @"
## Outcome

Deliver the production-shaped Synesis journey defined in `docs/ARCHITECTURE.md`: procure independent Olas Mech intelligence through KeeperHub, validate a deterministic quorum, execute a bounded Aave V3 USDC supply through KeeperHub, and publish independently verifiable proof.

## Definition of done

- The multi-page product works against persisted backend data.
- Live mode uses real Olas, IPFS, KeeperHub, Base, and Aave integrations.
- KeeperHub is the only transaction signing and broadcasting path.
- Every write is simulated, idempotent, reconciled, and receipt-verified.
- A duplicate event or replay attempt moves no additional value.
- A public proof bundle connects external request, delivery, policy, execution, and resulting Aave state.

The implementation checklist will be populated with the issues created from the architecture.
"@ `
    -Labels @("type: epic", "priority: p0") `
    -Milestone $milestone.number

$backlog = @(
    @{
        Title = "Scaffold the Synesis monorepo and quality gates"
        Labels = @("area: foundation", "area: devops", "priority: p0")
        Body = @"
## Scope

Create the pnpm monorepo described in the architecture with `apps/web`, `apps/api`, `apps/worker`, shared packages, the Python Olas adapter, and deployment directories.

## Acceptance criteria

- Root install, build, type-check, lint, and test commands work from a clean checkout.
- TypeScript uses strict mode and shared formatting/linting rules.
- Python has locked dependencies, Ruff, type checking, and pytest configuration.
- Environment variables are documented in safe `.env.example` files with no secrets.
- CI runs the quality gates on every pull request.
"@
    },
    @{
        Title = "Implement shared domain contracts and the persisted intent state machine"
        Labels = @("area: foundation", "area: backend", "priority: p0")
        Body = @"
## Scope

Define the canonical intent, recommendation, policy evaluation, execution plan, receipt, proof, and state-transition schemas.

## Acceptance criteria

- Every state in Architecture section 8 is represented and terminal states are immutable.
- Illegal transitions are rejected with typed domain errors.
- Shared Zod/JSON schemas are usable by the API, worker, UI, and tests.
- State transitions carry actor, reason, trace ID, timestamps, and before/after hashes.
- Boundary and transition-table tests cover every allowed and rejected transition.

## Depends on

- Monorepo scaffold.
"@
    },
    @{
        Title = "Create the PostgreSQL schema, migrations, and repository layer"
        Labels = @("area: foundation", "area: backend", "priority: p0")
        Body = @"
## Scope

Implement the entities and economic uniqueness constraints from Architecture section 9 using Drizzle and PostgreSQL.

## Acceptance criteria

- Forward and rollback migrations work on an empty database.
- Repositories expose typed transactional operations without leaking ORM details.
- Unique constraints protect idempotency keys, Olas request IDs, event keys, and successful economic intent purposes.
- Sensitive integration secrets are stored only by encrypted reference.
- Seed data is limited to clearly labelled development fixtures.
"@
    },
    @{
        Title = "Build the durable coordinator, outbox, inbox, and reconciliation jobs"
        Labels = @("area: backend", "area: foundation", "priority: p0")
        Body = @"
## Scope

Implement the worker that advances intents through the persisted state machine using BullMQ/Redis and PostgreSQL transactions.

## Acceptance criteria

- State changes and outbox messages are committed atomically.
- Event inbox suppresses duplicate webhooks and chain-scan events.
- Row/advisory locking prevents concurrent intent advancement.
- Jobs use bounded exponential backoff with jitter and state-specific timeouts.
- Crash-and-resume tests prove no duplicate economic action is created.
"@
    },
    @{
        Title = "Implement authentication, organizations, and approval RBAC"
        Labels = @("area: backend", "area: frontend", "area: security", "priority: p1")
        Body = @"
## Scope

Add secure authentication and organization membership with viewer, operator, approver, and owner roles.

## Acceptance criteria

- Protected API and page routes enforce organization isolation.
- Approval, policy activation, integration changes, and pause removal require recent authentication.
- Sessions use secure cookies and CSRF protection.
- Audit events record security-sensitive operations without credentials.
- Authorization tests cover cross-organization and role-escalation attempts.
"@
    },
    @{
        Title = "Build the responsive application shell and reusable design system"
        Labels = @("area: frontend", "priority: p0")
        Body = @"
## Scope

Create the Synesis visual language, responsive navigation, application shell, accessibility baseline, and reusable data-display components.

## Acceptance criteria

- Desktop and mobile navigation reach every route in Architecture section 6.
- The `LIVE / BASE MAINNET` versus `DEMO / NO VALUE` badge is always visible.
- Components cover loading, empty, partial, error, rejected, failed, and unconfirmed states.
- Keyboard navigation, focus states, contrast, and semantic landmarks pass accessibility checks.
- No page is a static mock: each page has a typed data boundary ready for real API data.
"@
    },
    @{
        Title = "Implement integration onboarding and live health checks"
        Labels = @("area: frontend", "area: backend", "area: keeperhub", "area: olas", "priority: p0")
        Body = @"
## Scope

Build `/app/settings/integrations` and the server-side checks for KeeperHub credentials, wallet, Base support, Olas deployments, RPC providers, IPFS, and delivery webhook.

## Acceptance criteria

- KeeperHub keys never reach the browser after submission and are encrypted at rest.
- Health checks show actionable component-level results and timestamps.
- The organization wallet and ETH/USDC balances are verified without moving funds.
- Olas deployment and Mech compatibility checks use live data.
- An organization becomes `READY` only after every required check passes.
"@
    },
    @{
        Title = "Implement the KeeperHub safe-execution client"
        Labels = @("area: keeperhub", "area: backend", "area: security", "priority: p0")
        Body = @"
## Scope

Build the only allowed write gateway for KeeperHub contract calls and protocol operations.

## Acceptance criteria

- Supports exact contract-call simulation and broadcast with the same canonical payload hash.
- Enforces chain, target, function-selector, value, token, and amount allowlists before network calls.
- Derives stable economic idempotency keys and forwards trace/request IDs.
- Honors KeeperHub rate-limit and poll-interval headers.
- Logs redacted evidence while preventing credential leakage.
"@
    },
    @{
        Title = "Implement KeeperHub receipt verification and unconfirmed recovery"
        Labels = @("area: keeperhub", "area: backend", "area: proof", "priority: p0")
        Body = @"
## Scope

Reconcile KeeperHub executions with independent Base receipts and classify success, revert, Safe inner failure, timeout, and unconfirmed states.

## Acceptance criteria

- Success requires `verified: true` and `receiptStatus: success`.
- A transaction hash or completed API status alone never marks success.
- Unconfirmed executions freeze the intent and reconcile the same execution ID without rebroadcast.
- Independent RPC receipt fields are hashed and compared with KeeperHub evidence.
- Tests cover delayed persistence, reverted calls, missing receipts, and eventual confirmation.
"@
    },
    @{
        Title = "Create the versioned Olas/Aave deployment manifest and calldata allowlist"
        Labels = @("area: olas", "area: keeperhub", "area: security", "priority: p0")
        Body = @"
## Scope

Pin verified Base addresses, ABI versions, bytecode expectations, function selectors, and spending bounds for USDC, Olas, and Aave.

## Acceptance criteria

- Manifest is content-hashed and immutable once referenced by an intent.
- Startup health checks compare configured addresses with live chain code.
- Raw calldata is decoded against the exact target ABI and overloaded functions cannot be ambiguous.
- Unknown targets, selectors, chain IDs, proxy implementations, or excessive values fail closed.
- Deployment updates require a new manifest version and audit event.
"@
    },
    @{
        Title = "Build the keyless Olas adapter using the official Mech client"
        Labels = @("area: olas", "area: backend", "area: security", "priority: p0")
        Body = @"
## Scope

Create the Python Olas adapter for discovery, IPFS envelopes, payment planning, request interpretation, and delivery parsing without a local private key.

## Acceptance criteria

- Uses the official `mech-client` behind a pinned dependency version.
- External signer path delegates allowed onchain transactions to the KeeperHub gateway.
- `sign_message`, offchain mode, and Olas Safe/agent mode are explicitly disabled in v1.
- Marketplace and supported legacy Mech shapes are normalized behind one interface.
- Service exposes typed health, quote, request-plan, and delivery APIs on private networking.
"@
    },
    @{
        Title = "Implement live Olas Mech discovery and compatibility scoring"
        Labels = @("area: olas", "area: backend", "area: frontend", "priority: p0")
        Body = @"
## Scope

Discover live Base Mechs and tools, freeze compatible metadata versions, and build `/app/mechs` plus `/app/mechs/[address]`.

## Acceptance criteria

- Pages display live address, service ID, tool schema, payment type, price, delivery history, and health.
- Compatibility rejects unsupported signing modes, schemas, chains, and inactive contracts.
- Users can select only eligible independent Mechs for an intent.
- Intent creation freezes Mech address, metadata CID, tool schema hash, and observed version.
- Empty and degraded marketplace states are handled without fabricated providers.
"@
    },
    @{
        Title = "Execute paid Olas Mech requests through KeeperHub"
        Labels = @("area: olas", "area: keeperhub", "area: backend", "priority: p0")
        Body = @"
## Scope

Implement quote, IPFS request upload, bounded token approval, request simulation, KeeperHub broadcast, receipt verification, and Olas request-ID extraction.

## Acceptance criteria

- Every payment/request call originates from the KeeperHub organization wallet.
- Maximum procurement cost is shown and approved before broadcast.
- Required approvals are exact or tightly bounded; unlimited approvals are forbidden.
- Each Mech request uses a distinct stable economic idempotency key.
- Confirmed Olas request IDs are extracted from verified event logs and persisted uniquely.
"@
    },
    @{
        Title = "Create the KeeperHub Olas-delivery event workflow and signed webhook"
        Labels = @("area: keeperhub", "area: olas", "area: backend", "priority: p0")
        Body = @"
## Scope

Use KeeperHub MCP to create and validate a saved Base event workflow that reacts to Olas deliveries and notifies Synesis.

## Acceptance criteria

- Workflow configuration is reproducible from source-controlled metadata.
- Trigger watches the pinned Olas delivery contract/event on Base.
- Webhook includes request ID, delivery reference, block, transaction hash, timestamp, nonce, and body signature.
- Synesis rejects invalid, expired, or replayed webhook payloads.
- A no-value signed test proves the delivery path during onboarding.
"@
    },
    @{
        Title = "Ingest, reconcile, and validate Olas deliveries and IPFS results"
        Labels = @("area: olas", "area: backend", "area: security", "priority: p0")
        Body = @"
## Scope

Process KeeperHub delivery webhooks and a fallback Base event scanner through one deduplicated inbox, then validate delivered IPFS results.

## Acceptance criteria

- Events are accepted only from the allowlisted contract after the confirmation threshold.
- Webhook and scanner copies of one event result in one delivery record.
- CID integrity, content hash, size, content type, schema, request binding, and freshness are verified.
- Free-form content is stored as untrusted data and cannot influence transaction targets or calldata.
- Reorg and missed-webhook tests recover without double processing.
"@
    },
    @{
        Title = "Implement the deterministic recommendation quorum engine"
        Labels = @("area: policy", "area: backend", "area: testing", "priority: p0")
        Body = @"
## Scope

Evaluate normalized Mech recommendations against immutable policy versions with no network or model access.

## Acceptance criteria

- Enforces distinct Mechs, matching request/chain/asset, SUPPLY agreement, confidence, risk, divergence, freshness, and amount caps.
- Emits a complete rule-by-rule decision report and canonical output hash.
- Any failed rule results in `REJECTED`, never an alternate action.
- Policy versions are immutable once used and activation is audited.
- Boundary, malformed-input, disagreement, expiry, and replay tests are exhaustive.
"@
    },
    @{
        Title = "Add spending limits, approval workflows, and emergency pause"
        Labels = @("area: policy", "area: security", "area: frontend", "priority: p0")
        Body = @"
## Scope

Implement procurement, per-intent, daily, and strategy limits with risk-based human approval and a fail-closed global pause.

## Acceptance criteria

- Users see maximum procurement and strategy exposure before approval.
- Above-threshold actions require a current authorized approver session.
- Emergency pause is checked immediately before every KeeperHub broadcast.
- Removing pause or raising limits requires owner authorization and an audit record.
- Concurrent intents cannot race past aggregate daily limits.
"@
    },
    @{
        Title = "Execute and verify the bounded Aave V3 USDC supply through KeeperHub"
        Labels = @("area: keeperhub", "area: backend", "area: proof", "priority: p0")
        Body = @"
## Scope

Create the frozen Aave execution plan, bounded USDC approval, exact simulation, broadcast, receipt reconciliation, and before/after position verification.

## Acceptance criteria

- Target, asset, amount, recipient, chain, ABI, selector, and expiry come only from the frozen intent and allowlist.
- Approval and supply calls follow simulate -> unchanged broadcast -> verified receipt.
- Rechecks policy, balance, expiry, pause, and prior-success uniqueness immediately before broadcast.
- Success requires matching KeeperHub receipt, independent Base receipt, and expected Aave position increase.
- Replaying the same intent moves no additional USDC.
"@
    },
    @{
        Title = "Build the interactive command center and global activity stream"
        Labels = @("area: frontend", "area: backend", "priority: p1")
        Body = @"
## Scope

Implement `/app` with live treasury summaries, active intents, approvals, executions, integration health, proof count, and a cross-page activity stream.

## Acceptance criteria

- Data comes from real typed APIs and persisted lifecycle records.
- Cards link to the relevant intent, execution, policy, Mech, or proof page.
- Updates arrive through SSE with resilient polling fallback.
- Failed and unconfirmed activity is as visible as successful activity.
- Responsive loading, empty, stale, error, and partial-data states are complete.
"@
    },
    @{
        Title = "Build intent list and the guided new-intent wizard"
        Labels = @("area: frontend", "area: backend", "priority: p0")
        Body = @"
## Scope

Implement `/app/intents` and `/app/intents/new` for strategy selection, amount, independent Mechs, policy, expiry, quote, exposure review, and confirmation.

## Acceptance criteria

- List filters by lifecycle state, time, strategy, and environment.
- Wizard prevents unsupported assets, chains, Mechs, policies, and excessive amounts.
- Live quote shows Mech prices, possible approval calls, and total maximum exposure.
- Final confirmation displays the immutable intent snapshot hash.
- Refreshing or navigating between steps preserves safe server-side draft state.
"@
    },
    @{
        Title = "Build the live Intent Room lifecycle experience"
        Labels = @("area: frontend", "area: backend", "area: proof", "priority: p0")
        Body = @"
## Scope

Implement `/app/intents/[id]` as the primary product and demo screen for the complete cross-protocol lifecycle.

## Acceptance criteria

- Timeline shows quote, approvals, KeeperHub simulations, Olas payments, request IDs, deliveries, quorum, Aave execution, and proof.
- Each item links to related Mech, policy, execution, explorer, or proof details.
- Users can approve, cancel, or pause only when state and role permit.
- Live updates survive reconnects and are ordered by persisted sequence number.
- Rejection, expiry, failure, and unconfirmed journeys have complete explanations and recovery actions.
"@
    },
    @{
        Title = "Build execution ledger, execution detail, and treasury pages"
        Labels = @("area: frontend", "area: keeperhub", "priority: p1")
        Body = @"
## Scope

Implement `/app/executions`, `/app/executions/[id]`, and `/app/treasury` using KeeperHub evidence and independent chain reads.

## Acceptance criteria

- Ledger filters simulations and broadcasts by purpose and outcome.
- Detail shows canonical call, payload hash, KeeperHub status, verified receipt, decoded logs, retries, and explorer links.
- Treasury shows wallet, ETH/USDC, Olas prepaid balance, Aave position, and remaining policy capacity.
- Sensitive credentials and private response fields never appear.
- Chain data includes block number and freshness indicators.
"@
    },
    @{
        Title = "Implement canonical proof bundles and the public verifier"
        Labels = @("area: proof", "area: frontend", "area: backend", "priority: p0")
        Body = @"
## Scope

Build proof canonicalization, ordered evidence hashing, redaction, export, `/app/proofs`, and public `/verify/[proofId]` pages.

## Acceptance criteria

- Bundle connects intent, prompts, policy, Mechs, IPFS, Olas events, simulations, KeeperHub executions, receipts, and Aave state delta.
- Verifier recalculates entry hashes and proof root without trusting UI state.
- Public bundle contains no secrets or private organization data.
- JSON download and direct explorer links work without authentication.
- Tampering with any included entry produces an obvious verification failure.
"@
    },
    @{
        Title = "Add end-to-end observability, metrics, and operational alerts"
        Labels = @("area: observability", "area: backend", "priority: p1")
        Body = @"
## Scope

Propagate trace IDs through APIs, jobs, KeeperHub requests, webhook events, logs, and proofs; add metrics and alerts from Architecture section 14.

## Acceptance criteria

- Structured logs are correlated and redact credentials and sensitive payloads.
- Metrics cover lifecycle latency, Mech delivery, quorum, KeeperHub outcomes, duplicates, and treasury capacity.
- Health endpoints distinguish degraded dependencies from total outage.
- Alerts cover stuck intents, unexpected call attempts, unconfirmed writes, low balances, and proof mismatches.
- A runbook maps each alert to safe investigation and recovery steps.
"@
    },
    @{
        Title = "Build unit, contract, and external-integration test suites"
        Labels = @("area: testing", "area: keeperhub", "area: olas", "priority: p0")
        Body = @"
## Scope

Implement deterministic unit tests and recorded contract tests for domain, policy, proof, KeeperHub, Olas, IPFS, webhooks, and Aave boundaries.

## Acceptance criteria

- Tests cover every state transition and policy boundary.
- KeeperHub fixtures include success, revert, delayed persistence, Safe inner failure, timeout, and unconfirmed.
- Olas fixtures cover supported payment/deployment shapes and invalid deliveries.
- Security tests cover calldata, schema, webhook, replay, redaction, and cross-organization attacks.
- Test commands are deterministic and run in CI without spending funds.
"@
    },
    @{
        Title = "Build Playwright end-to-end journeys and replay/failure drills"
        Labels = @("area: testing", "area: frontend", "area: security", "priority: p0")
        Body = @"
## Scope

Automate the complete browser journeys for onboarding, intent creation, approval, live updates, rejection, failure, proof verification, and replay resistance.

## Acceptance criteria

- Happy path spans all connected product pages using realistic service boundaries.
- Refresh/reconnect during each long-running state preserves the journey.
- Duplicate webhook, duplicate job, and repeated execute clicks create no second economic intent.
- Accessibility checks run on every primary route.
- Screenshots/traces are retained for CI failures and demo rehearsal.
"@
    },
    @{
        Title = "Containerize Synesis and establish preview/production CI/CD"
        Labels = @("area: devops", "area: security", "priority: p0")
        Body = @"
## Scope

Create local Docker Compose and hosted deployments for web, API, worker, Olas adapter, PostgreSQL, Redis, evidence storage, and observability.

## Acceptance criteria

- A clean checkout starts locally from documented commands.
- Live external writes require explicit `SYNESIS_MODE=live` acknowledgement.
- Preview deployments cannot access production KeeperHub credentials or funds.
- Production uses private service networking, encrypted secrets, health checks, migrations, backups, and rollback steps.
- Main branch deployment is gated by tests and manual production approval.
"@
    },
    @{
        Title = "Run and verify the low-value Base mainnet acceptance journey"
        Labels = @("area: keeperhub", "area: olas", "area: proof", "area: testing", "priority: p0")
        Body = @"
## Scope

Execute the eight-part live acceptance test from Architecture section 16 with strictly capped funds.

## Acceptance criteria

- Two paid Olas requests are submitted through KeeperHub and confirmed on Base.
- Two Olas deliveries are confirmed and pass schema/integrity validation.
- Deterministic quorum passes with a stored rule report.
- A bounded Aave USDC supply executes through KeeperHub with verified receipts and state delta.
- Public proof bundle and explorer links independently demonstrate the complete chain.
- A replay attempt is recorded and moves no additional value.
"@
    },
    @{
        Title = "Prepare product documentation, runbook, demo, and hackathon submission"
        Labels = @("documentation", "area: proof", "priority: p0")
        Body = @"
## Scope

Turn the working product and evidence into reproducible documentation and a concise judge-facing presentation.

## Acceptance criteria

- README contains architecture, setup, local development, live safety, and verified proof links.
- Security model and incident/recovery runbook are explicit about limitations.
- Demo script shows the live external trigger, KeeperHub value movement, observability, and replay rejection in under four minutes.
- Submission identifies Olas and Aave as live projects and lists every KeeperHub surface used.
- Source, deployed app, short video, KeeperHub execution IDs, and Base transaction links are verified before submission.
"@
    }
)

$createdIssues = @()
foreach ($item in $backlog) {
    $createdIssues += Ensure-Issue `
        -Title $item.Title `
        -Body $item.Body `
        -Labels $item.Labels `
        -Milestone $milestone.number
}

$checklist = ($createdIssues | ForEach-Object { "- [ ] #$($_.number) $($_.title)" }) -join "`n"
$epicBody = @"
## Outcome

Deliver the production-shaped Synesis journey defined in `docs/ARCHITECTURE.md`: procure independent Olas Mech intelligence through KeeperHub, validate a deterministic quorum, execute a bounded Aave V3 USDC supply through KeeperHub, and publish independently verifiable proof.

## Definition of done

- The multi-page product works against persisted backend data.
- Live mode uses real Olas, IPFS, KeeperHub, Base, and Aave integrations.
- KeeperHub is the only transaction signing and broadcasting path.
- Every write is simulated, idempotent, reconciled, and receipt-verified.
- A duplicate event or replay attempt moves no additional value.
- A public proof bundle connects external request, delivery, policy, execution, and resulting Aave state.

## Implementation checklist

$checklist
"@

Invoke-GitHub -Method PATCH -Uri "$apiRoot/issues/$($epic.number)" -Body @{
    title     = $epic.title
    body      = $epicBody
    labels    = @("type: epic", "priority: p0")
    milestone = $milestone.number
} | Out-Null

[PSCustomObject]@{
    Repository = "$Owner/$Repository"
    Milestone  = $milestone.title
    Epic       = "#$($epic.number)"
    Tasks      = $createdIssues.Count
}
