import type { StatusBadgeProps, ViewState } from "@synesis/ui";
import { cookies } from "next/headers";

export type PageKey =
  | "command-center"
  | "intents"
  | "new-intent"
  | "intent-detail"
  | "mechs"
  | "mech-detail"
  | "policies"
  | "policy-detail"
  | "executions"
  | "execution-detail"
  | "treasury"
  | "proofs"
  | "proof-detail"
  | "integrations"
  | "security";

export interface PageMetric {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly accent?: boolean;
}

export interface PageRow {
  readonly id: string;
  readonly primary: string;
  readonly secondary: string;
  readonly value: string;
  readonly meta: string;
  readonly status: string;
  readonly tone: NonNullable<StatusBadgeProps["tone"]>;
  readonly href?: string;
}

export interface ProductPageModel {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly updatedAt: string;
  readonly primaryAction?: { readonly label: string; readonly href: string };
  readonly metrics: readonly PageMetric[];
  readonly listTitle: string;
  readonly listDescription: string;
  readonly rows: readonly PageRow[];
}

const model = (
  input: Omit<ProductPageModel, "updatedAt">,
): ProductPageModel => ({ ...input, updatedAt: "14 Sep 2026 · 12:04 WAT" });

const models: Readonly<Record<PageKey, ProductPageModel>> = {
  "command-center": model({
    eyebrow: "Command center / Base",
    title: "Value moves only after intelligence proves it should.",
    description:
      "One operational surface for paid agent decisions, bounded KeeperHub execution, and independently verifiable evidence.",
    primaryAction: { label: "Create intent", href: "/app/intents/new" },
    metrics: [
      {
        label: "KeeperHub treasury",
        value: "$24,860.42",
        detail: "+1.8% this week",
        accent: true,
      },
      { label: "Active intents", value: "03", detail: "1 awaiting approval" },
      { label: "Verified proofs", value: "128", detail: "100% hash-valid" },
      {
        label: "Integration health",
        value: "5 / 5",
        detail: "All systems ready",
      },
    ],
    listTitle: "Live decision lifecycles",
    listDescription:
      "Recent activity across procurement, quorum, simulation, and execution.",
    rows: [
      {
        id: "SYN-1042",
        primary: "USDC yield rebalance",
        secondary: "Aave V3 · Base",
        value: "$5,000.00",
        meta: "Quorum 3 / 3",
        status: "AWAITING APPROVAL",
        tone: "warning",
        href: "/app/intents/SYN-1042",
      },
      {
        id: "SYN-1041",
        primary: "Treasury risk review",
        secondary: "3 Olas Mechs",
        value: "$18.60",
        meta: "Proof 0x8c2…91f",
        status: "VERIFIED",
        tone: "positive",
        href: "/app/intents/SYN-1041",
      },
      {
        id: "SYN-1040",
        primary: "Supply idle USDC",
        secondary: "Aave V3 · Base",
        value: "$2,500.00",
        meta: "Block 35,902,184",
        status: "CONFIRMED",
        tone: "info",
        href: "/app/executions/KH-8831",
      },
    ],
  }),
  intents: model({
    eyebrow: "Decision network / Intents",
    title: "Intent ledger",
    description:
      "Every decision lifecycle, from frozen inputs through paid intelligence and final evidence.",
    primaryAction: { label: "New intent", href: "/app/intents/new" },
    metrics: [
      { label: "Active", value: "03", detail: "Across 2 strategies" },
      {
        label: "Needs approval",
        value: "01",
        detail: "Fresh auth required",
        accent: true,
      },
      { label: "Completed", value: "42", detail: "Last 30 days" },
    ],
    listTitle: "All intents",
    listDescription:
      "Filter-ready typed records ordered by most recent state change.",
    rows: [
      {
        id: "SYN-1042",
        primary: "USDC yield rebalance",
        secondary: "Created by Alice",
        value: "$5,000.00",
        meta: "Expires in 18m",
        status: "AWAITING APPROVAL",
        tone: "warning",
        href: "/app/intents/SYN-1042",
      },
      {
        id: "SYN-1041",
        primary: "Treasury risk review",
        secondary: "Created by scheduler",
        value: "$18.60",
        meta: "3 Mech deliveries",
        status: "PROOF READY",
        tone: "positive",
        href: "/app/intents/SYN-1041",
      },
      {
        id: "SYN-1039",
        primary: "Conservative supply",
        secondary: "Created by Alice",
        value: "$4,000.00",
        meta: "Policy rejected",
        status: "REJECTED",
        tone: "danger",
        href: "/app/intents/SYN-1039",
      },
    ],
  }),
  "new-intent": model({
    eyebrow: "Decision network / New intent",
    title: "Compose a bounded intent",
    description:
      "Choose the objective, intelligence budget, policy, and expiry before freezing an immutable decision snapshot.",
    metrics: [
      {
        label: "01",
        value: "Strategy",
        detail: "Aave V3 USDC supply",
        accent: true,
      },
      { label: "02", value: "Intelligence", detail: "3 independent Mechs" },
      { label: "03", value: "Guardrails", detail: "Treasury policy v4" },
      { label: "04", value: "Review", detail: "Maximum spend shown" },
    ],
    listTitle: "Maximum possible spend",
    listDescription:
      "A typed preview boundary; the intent workflow will submit these exact bounded inputs.",
    rows: [
      {
        id: "principal",
        primary: "Execution principal",
        secondary: "USDC supplied to Aave",
        value: "$5,000.00",
        meta: "Refundable position",
        status: "BOUNDED",
        tone: "info",
      },
      {
        id: "mechs",
        primary: "Agent procurement",
        secondary: "3 × independent analysis",
        value: "$18.60",
        meta: "Hard maximum",
        status: "CAPPED",
        tone: "positive",
      },
      {
        id: "gas",
        primary: "Network fees",
        secondary: "KeeperHub estimate",
        value: "$1.25",
        meta: "Simulation required",
        status: "ESTIMATE",
        tone: "neutral",
      },
    ],
  }),
  "intent-detail": model({
    eyebrow: "Intent room / SYN-1042",
    title: "USDC yield rebalance",
    description:
      "A live, evidence-linked timeline connecting paid Olas intelligence to bounded KeeperHub execution.",
    metrics: [
      {
        label: "Principal",
        value: "$5,000.00",
        detail: "USDC · Base",
        accent: true,
      },
      { label: "Quorum", value: "3 / 3", detail: "Risk-adjusted supply" },
      { label: "Policy", value: "v4", detail: "0x71a…c20" },
      { label: "Expires", value: "18m", detail: "At block-safe time" },
    ],
    listTitle: "Evidence timeline",
    listDescription:
      "Each stage links to its source entity and immutable hash.",
    rows: [
      {
        id: "01",
        primary: "Intent frozen",
        secondary: "Snapshot 0x4de…2a1",
        value: "11:58:02",
        meta: "Inputs immutable",
        status: "VERIFIED",
        tone: "positive",
      },
      {
        id: "02",
        primary: "Olas procurement",
        secondary: "3 Mechs paid through KeeperHub",
        value: "$18.60",
        meta: "3 deliveries",
        status: "DELIVERED",
        tone: "positive",
        href: "/app/mechs",
      },
      {
        id: "03",
        primary: "Deterministic quorum",
        secondary: "3 / 3 recommend supply",
        value: "12:02:07",
        meta: "Ruleset v4",
        status: "PASSED",
        tone: "positive",
        href: "/app/policies/policy-v4",
      },
      {
        id: "04",
        primary: "Execution approval",
        secondary: "Recent authentication required",
        value: "Pending",
        meta: "Owner or approver",
        status: "AWAITING",
        tone: "warning",
      },
    ],
  }),
  mechs: model({
    eyebrow: "Decision network / Olas",
    title: "Mech marketplace",
    description:
      "Live agent services scored for schema compatibility, price, independence, and delivery history.",
    metrics: [
      { label: "Discovered", value: "24", detail: "Base deployments" },
      {
        label: "Eligible",
        value: "08",
        detail: "Current policy",
        accent: true,
      },
      { label: "Median delivery", value: "42s", detail: "Last 100 requests" },
    ],
    listTitle: "Eligible intelligence providers",
    listDescription:
      "Onchain identities and tool versions observed from Olas registries.",
    rows: [
      {
        id: "0x21…91b",
        primary: "Gaia Risk Mech",
        secondary: "risk-analysis/v3",
        value: "$6.20",
        meta: "98.7% delivered",
        status: "COMPATIBLE",
        tone: "positive",
        href: "/app/mechs/0x21a091b",
      },
      {
        id: "0xa8…110",
        primary: "Valory DeFi Analyst",
        secondary: "yield-review/v2",
        value: "$5.90",
        meta: "97.9% delivered",
        status: "COMPATIBLE",
        tone: "positive",
        href: "/app/mechs/0xa8b110",
      },
      {
        id: "0xf3…c42",
        primary: "Sentinel Markets",
        secondary: "market-risk/v1",
        value: "$6.50",
        meta: "Schema drift",
        status: "PARTIAL",
        tone: "warning",
        href: "/app/mechs/0xf3c42",
      },
    ],
  }),
  "mech-detail": model({
    eyebrow: "Olas Mech / 0x21…91b",
    title: "Gaia Risk Mech",
    description:
      "Onchain service identity, current tool contract, price, and eligibility evidence.",
    metrics: [
      {
        label: "Delivery rate",
        value: "98.7%",
        detail: "1,284 requests",
        accent: true,
      },
      { label: "Median latency", value: "38s", detail: "30-day window" },
      { label: "Quoted price", value: "$6.20", detail: "Per request" },
    ],
    listTitle: "Supported tool versions",
    listDescription: "Schema hashes are pinned when an intent is frozen.",
    rows: [
      {
        id: "risk-v3",
        primary: "risk-analysis / v3",
        secondary: "0xa73…7e2",
        value: "JSON schema",
        meta: "Observed 4m ago",
        status: "ELIGIBLE",
        tone: "positive",
      },
      {
        id: "yield-v2",
        primary: "yield-review / v2",
        secondary: "0x92e…115",
        value: "JSON schema",
        meta: "Observed 4m ago",
        status: "ELIGIBLE",
        tone: "positive",
      },
    ],
  }),
  policies: model({
    eyebrow: "Control plane / Policies",
    title: "Immutable guardrails",
    description:
      "Human-readable controls compiled into canonical, content-addressed policy versions.",
    metrics: [
      {
        label: "Active policy",
        value: "v4",
        detail: "Activated by Alice",
        accent: true,
      },
      { label: "Execution cap", value: "$10,000", detail: "Per intent" },
      { label: "Quorum", value: "3 / 3", detail: "Independent Mechs" },
    ],
    listTitle: "Policy history",
    listDescription:
      "Versions never mutate; activation is audited and requires fresh authentication.",
    rows: [
      {
        id: "v4",
        primary: "Treasury guardrails v4",
        secondary: "0x71a…c20",
        value: "$10,000 cap",
        meta: "3 / 3 quorum",
        status: "ACTIVE",
        tone: "positive",
        href: "/app/policies/policy-v4",
      },
      {
        id: "v3",
        primary: "Treasury guardrails v3",
        secondary: "0x903…e18",
        value: "$7,500 cap",
        meta: "2 / 3 quorum",
        status: "SUPERSEDED",
        tone: "neutral",
        href: "/app/policies/policy-v3",
      },
    ],
  }),
  "policy-detail": model({
    eyebrow: "Policy / Treasury guardrails v4",
    title: "Rules humans and machines can verify.",
    description:
      "Readable constraints beside the canonical policy hash consumed by the deterministic evaluator.",
    metrics: [
      {
        label: "Content hash",
        value: "0x71a…c20",
        detail: "SHA-256",
        accent: true,
      },
      { label: "Maximum value", value: "$10,000", detail: "Per intent" },
      {
        label: "Approval mode",
        value: "Dual",
        detail: "Procurement + execution",
      },
    ],
    listTitle: "Effective rules",
    listDescription:
      "The canonical JSON boundary supplies the exact same typed rules.",
    rows: [
      {
        id: "allowlist",
        primary: "Target allowlist",
        secondary: "Aave V3 Pool · Base",
        value: "1 contract",
        meta: "Exact address",
        status: "ENFORCED",
        tone: "positive",
      },
      {
        id: "simulation",
        primary: "Simulation",
        secondary: "No revert, bounded deltas",
        value: "Required",
        meta: "Before broadcast",
        status: "ENFORCED",
        tone: "positive",
      },
      {
        id: "quorum",
        primary: "Independent quorum",
        secondary: "No duplicate operator",
        value: "3 / 3",
        meta: "Unanimous",
        status: "ENFORCED",
        tone: "positive",
      },
    ],
  }),
  executions: model({
    eyebrow: "Value movement / KeeperHub",
    title: "Execution ledger",
    description:
      "Simulations, broadcasts, confirmations, and safe failures with one traceable receipt surface.",
    metrics: [
      {
        label: "Confirmed value",
        value: "$18,420",
        detail: "30-day window",
        accent: true,
      },
      { label: "Success rate", value: "97.8%", detail: "45 broadcasts" },
      { label: "Prevented", value: "06", detail: "Policy or simulation" },
    ],
    listTitle: "KeeperHub executions",
    listDescription:
      "Every idempotent execution and its economic finality state.",
    rows: [
      {
        id: "KH-8831",
        primary: "Aave V3 supply",
        secondary: "Intent SYN-1040",
        value: "$2,500.00",
        meta: "Block 35,902,184",
        status: "CONFIRMED",
        tone: "positive",
        href: "/app/executions/KH-8831",
      },
      {
        id: "KH-8830",
        primary: "Olas request payment",
        secondary: "Intent SYN-1041",
        value: "$18.60",
        meta: "3 requests",
        status: "CONFIRMED",
        tone: "positive",
        href: "/app/executions/KH-8830",
      },
      {
        id: "KH-8829",
        primary: "Aave V3 supply",
        secondary: "Intent SYN-1039",
        value: "$4,000.00",
        meta: "Policy cap",
        status: "REJECTED",
        tone: "danger",
        href: "/app/executions/KH-8829",
      },
      {
        id: "KH-8828",
        primary: "Aave V3 supply",
        secondary: "Intent SYN-1038",
        value: "$1,200.00",
        meta: "2 confirmations",
        status: "UNCONFIRMED",
        tone: "warning",
        href: "/app/executions/KH-8828",
      },
    ],
  }),
  "execution-detail": model({
    eyebrow: "KeeperHub receipt / KH-8831",
    title: "Aave V3 supply",
    description:
      "The exact simulated call, broadcast result, decoded receipt, and retry history.",
    metrics: [
      {
        label: "Value moved",
        value: "$2,500.00",
        detail: "2,500 USDC",
        accent: true,
      },
      { label: "Finality", value: "18 conf.", detail: "Base block 35,902,184" },
      { label: "Gas used", value: "184,221", detail: "0.000021 ETH" },
    ],
    listTitle: "Receipt evidence",
    listDescription:
      "Call plan and observation hashes are retained without exposing credentials.",
    rows: [
      {
        id: "simulation",
        primary: "Simulation",
        secondary: "0x51b…90c",
        value: "No revert",
        meta: "+aUSDC / −USDC",
        status: "PASSED",
        tone: "positive",
      },
      {
        id: "broadcast",
        primary: "Broadcast",
        secondary: "0x7f2…d09",
        value: "KeeperHub",
        meta: "Attempt 1",
        status: "ACCEPTED",
        tone: "info",
      },
      {
        id: "receipt",
        primary: "Receipt verification",
        secondary: "0x2c8…df1",
        value: "18 conf.",
        meta: "Logs decoded",
        status: "VERIFIED",
        tone: "positive",
      },
    ],
  }),
  treasury: model({
    eyebrow: "Value & evidence / Treasury",
    title: "Bounded capital",
    description:
      "KeeperHub wallet balances, protocol positions, prepaid intelligence, and maximum exposure.",
    metrics: [
      {
        label: "Total controlled",
        value: "$24,860.42",
        detail: "Base mainnet",
        accent: true,
      },
      { label: "Available USDC", value: "$14,230.18", detail: "57.2% liquid" },
      { label: "Aave position", value: "$10,612.20", detail: "2.91% APY" },
      { label: "ETH for gas", value: "0.0142", detail: "$18.04" },
    ],
    listTitle: "Capital surfaces",
    listDescription:
      "Read-only snapshots; movement occurs only through an approved KeeperHub plan.",
    rows: [
      {
        id: "wallet",
        primary: "KeeperHub organization wallet",
        secondary: "0x83a…c19",
        value: "$14,248.22",
        meta: "Base",
        status: "HEALTHY",
        tone: "positive",
      },
      {
        id: "aave",
        primary: "Aave V3 supplied USDC",
        secondary: "aUSDC position",
        value: "$10,612.20",
        meta: "2.91% APY",
        status: "VERIFIED",
        tone: "positive",
      },
      {
        id: "olas",
        primary: "Olas prepaid balance",
        secondary: "Agent requests",
        value: "$124.00",
        meta: "20 requests est.",
        status: "FUNDED",
        tone: "info",
      },
    ],
  }),
  proofs: model({
    eyebrow: "Value & evidence / Proofs",
    title: "Proof library",
    description:
      "Search, inspect, and export the evidence chain behind every completed decision and movement.",
    metrics: [
      {
        label: "Verified bundles",
        value: "128",
        detail: "All-time",
        accent: true,
      },
      { label: "Public links", value: "12", detail: "Redacted views" },
      { label: "Hash failures", value: "00", detail: "Recalculated locally" },
    ],
    listTitle: "Evidence bundles",
    listDescription:
      "Public verifier links recalculate canonical hashes independently.",
    rows: [
      {
        id: "PRF-1041",
        primary: "Treasury risk review",
        secondary: "Intent SYN-1041",
        value: "9 artifacts",
        meta: "0x8c2…91f",
        status: "VERIFIED",
        tone: "positive",
        href: "/verify/PRF-1041",
      },
      {
        id: "PRF-1040",
        primary: "Supply idle USDC",
        secondary: "Intent SYN-1040",
        value: "11 artifacts",
        meta: "0x1ae…f42",
        status: "VERIFIED",
        tone: "positive",
        href: "/verify/PRF-1040",
      },
    ],
  }),
  "proof-detail": model({
    eyebrow: "Public verification / PRF-1041",
    title: "Evidence that recomputes.",
    description:
      "A redacted chain of canonical artifacts proving agent procurement, decision, and economic outcome.",
    metrics: [
      {
        label: "Root hash",
        value: "0x8c2…91f",
        detail: "Recalculated",
        accent: true,
      },
      { label: "Artifacts", value: "09", detail: "All hash-valid" },
      { label: "Value movement", value: "$18.60", detail: "Olas procurement" },
    ],
    listTitle: "Verification chain",
    listDescription:
      "No Synesis account is required to inspect this redacted bundle.",
    rows: [
      {
        id: "intent",
        primary: "Frozen intent",
        secondary: "Canonical snapshot",
        value: "0x4de…2a1",
        meta: "Local hash match",
        status: "VALID",
        tone: "positive",
      },
      {
        id: "delivery",
        primary: "Olas deliveries",
        secondary: "3 normalized results",
        value: "0xb77…a03",
        meta: "Content addressed",
        status: "VALID",
        tone: "positive",
      },
      {
        id: "receipt",
        primary: "KeeperHub receipt",
        secondary: "Economic outcome",
        value: "0x2c8…df1",
        meta: "Onchain observed",
        status: "VALID",
        tone: "positive",
      },
    ],
  }),
  integrations: model({
    eyebrow: "Control plane / Integrations",
    title: "Live connections",
    description:
      "Credential-safe health checks for every system in the Synesis decision and execution path.",
    metrics: [
      {
        label: "Ready",
        value: "05 / 05",
        detail: "All required systems",
        accent: true,
      },
      { label: "Median latency", value: "184ms", detail: "Last health cycle" },
      { label: "Last checked", value: "12:04", detail: "26 seconds ago" },
    ],
    listTitle: "Integration health",
    listDescription:
      "Secrets remain server-side; the UI receives health and scope evidence only.",
    rows: [
      {
        id: "keeperhub",
        primary: "KeeperHub",
        secondary: "Direct Execution + MCP",
        value: "184ms",
        meta: "Wallet + workflows",
        status: "READY",
        tone: "positive",
      },
      {
        id: "olas",
        primary: "Olas",
        secondary: "Mech Marketplace · Base",
        value: "312ms",
        meta: "24 Mechs",
        status: "READY",
        tone: "positive",
      },
      {
        id: "rpc",
        primary: "Base RPC",
        secondary: "Primary + fallback",
        value: "92ms",
        meta: "Block 35,902,202",
        status: "READY",
        tone: "positive",
      },
      {
        id: "ipfs",
        primary: "IPFS gateway",
        secondary: "Pinned evidence",
        value: "221ms",
        meta: "Write verified",
        status: "READY",
        tone: "positive",
      },
      {
        id: "webhooks",
        primary: "Signed webhooks",
        secondary: "Delivery ingestion",
        value: "41ms",
        meta: "Replay protected",
        status: "READY",
        tone: "positive",
      },
    ],
  }),
  security: model({
    eyebrow: "Control plane / Security",
    title: "Guardrails before velocity.",
    description:
      "Allowlists, limits, approval thresholds, emergency state, and active session controls.",
    metrics: [
      {
        label: "Emergency state",
        value: "ACTIVE",
        detail: "Execution permitted",
        accent: true,
      },
      { label: "Intent cap", value: "$10,000", detail: "Treasury policy v4" },
      {
        label: "Active sessions",
        value: "02",
        detail: "Both recently verified",
      },
    ],
    listTitle: "Security controls",
    listDescription:
      "Administrative changes require owner capability, CSRF proof, and fresh OIDC authentication.",
    rows: [
      {
        id: "allowlist",
        primary: "Contract allowlist",
        secondary: "Aave V3 Pool · Base",
        value: "1 target",
        meta: "Exact calldata",
        status: "ENFORCED",
        tone: "positive",
      },
      {
        id: "approval",
        primary: "Approval threshold",
        secondary: "Execution decisions",
        value: "1 approver",
        meta: "Fresh auth <10m",
        status: "ENFORCED",
        tone: "positive",
      },
      {
        id: "session-1",
        primary: "Current session",
        secondary: "Chrome · Lagos, NG",
        value: "Now",
        meta: "Expires in 11h",
        status: "CURRENT",
        tone: "info",
      },
      {
        id: "session-2",
        primary: "CLI session",
        secondary: "Automation runner",
        value: "2h ago",
        meta: "Read-only",
        status: "ACTIVE",
        tone: "neutral",
      },
    ],
  }),
};

const isProductPageModel = (value: unknown): value is ProductPageModel => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.eyebrow === "string" &&
    typeof record.title === "string" &&
    typeof record.description === "string" &&
    Array.isArray(record.metrics) &&
    Array.isArray(record.rows)
  );
};

export async function loadProductPage(
  key: PageKey,
  resourceId?: string,
): Promise<ViewState<ProductPageModel>> {
  if (process.env.SYNESIS_MODE !== "live") {
    const selected = models[key];
    return {
      status: "ready",
      data: resourceId
        ? {
            ...selected,
            eyebrow: selected.eyebrow.replace(
              /\/[\s][^/]+$/u,
              `/ ${resourceId}`,
            ),
          }
        : selected,
    };
  }

  const apiUrl =
    process.env.SYNESIS_API_INTERNAL_URL ?? "http://localhost:4000";
  const cookieStore = await cookies();
  const session = cookieStore.get("__Host-synesis_session")?.value;
  try {
    const url = new URL(`/api/v1/ui/${key}`, apiUrl);
    if (resourceId) url.searchParams.set("id", resourceId);
    const response = await fetch(url, {
      cache: "no-store",
      ...(session
        ? { headers: { cookie: `__Host-synesis_session=${session}` } }
        : {}),
    });
    if (response.status === 404) return { status: "empty" };
    if (!response.ok) return { status: "error" };
    const payload = (await response.json()) as unknown;
    return isProductPageModel(payload)
      ? { status: "ready", data: payload }
      : { status: "partial", message: "The API response was incomplete." };
  } catch {
    return {
      status: "error",
      message: "The live Synesis API could not be reached.",
    };
  }
}
