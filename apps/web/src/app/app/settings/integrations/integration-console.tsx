"use client";
import { StatusBadge } from "@synesis/ui";
import { useActionState } from "react";
import { manageIntegrations } from "./actions";
import type {
  IntegrationActionState,
  IntegrationCheck,
  IntegrationHealth,
} from "./types";
const labels: Readonly<Record<string, string>> = {
  keeperhub_credentials: "KeeperHub key",
  keeperhub_wallet: "Organization wallet",
  base_support: "KeeperHub Base support",
  base_rpc: "Base RPC",
  wallet_balances: "ETH + USDC balances",
  olas_deployments: "Olas deployments",
  mech_compatibility: "Mech compatibility",
  ipfs: "IPFS delivery",
  delivery_webhook: "Signed webhook",
  session: "Synesis session",
};
const tone = (status: IntegrationCheck["status"]) =>
  status === "ready" ? "positive" : status === "failed" ? "danger" : "neutral";
const formatEth = (wei: string) => `${(Number(wei) / 1e18).toFixed(5)} ETH`;
const formatUsdc = (raw: string) => `${(Number(raw) / 1e6).toFixed(2)} USDC`;
export function IntegrationConsole({
  initialHealth,
}: {
  readonly initialHealth: IntegrationHealth;
}) {
  const initialState: IntegrationActionState = {
    status: "idle",
    health: initialHealth,
  };
  const [state, action, pending] = useActionState(
    manageIntegrations,
    initialState,
  );
  const health = state.health;
  const ready = health.readiness === "READY";
  return (
    <div className="integration-layout">
      <section
        className={`readiness-banner ${ready ? "is-ready" : ""}`}
        aria-live="polite"
      >
        <div>
          <p className="section-index">// ORGANIZATION GATE</p>
          <h2>
            {ready ? "READY FOR VALUE MOVEMENT" : "NOT READY — WRITES BLOCKED"}
          </h2>
          <p>
            {ready
              ? "Every required dependency passed a live, timestamped check."
              : "Synesis will not move value until every required dependency is verified."}
          </p>
        </div>
        <form action={action}>
          <input type="hidden" name="operation" value="recheck" />
          <button className="secondary-action" type="submit" disabled={pending}>
            {pending ? "CHECKING…" : "RUN ALL CHECKS"}
          </button>
        </form>
      </section>
      {state.message ? (
        <p
          className={`action-notice is-${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
      <section className="integration-health" aria-labelledby="health-heading">
        <header>
          <div>
            <p className="section-index">// LIVE DEPENDENCIES</p>
            <h2 id="health-heading">Integration health</h2>
          </div>
          <span>
            {health.checks.filter((check) => check.status === "ready").length}/
            {health.checks.length} PASSING
          </span>
        </header>
        <div className="health-grid">
          {health.checks.map((check) => (
            <article className="health-card" key={check.component}>
              <div>
                <span className="health-mark" aria-hidden="true">
                  {check.status === "ready"
                    ? "✓"
                    : check.status === "failed"
                      ? "!"
                      : "·"}
                </span>
                <StatusBadge tone={tone(check.status)}>
                  {check.status.toUpperCase()}
                </StatusBadge>
              </div>
              <h3>{labels[check.component] ?? check.component}</h3>
              <p>{check.message}</p>
              <small>
                {new Date(check.checkedAt).toLocaleString()} ·{" "}
                {check.durationMs} ms
              </small>
            </article>
          ))}
        </div>
      </section>
      {health.wallet ? (
        <section
          className="wallet-strip"
          aria-label="Verified organization wallet balances"
        >
          <div>
            <span>KEEPERHUB SIGNER</span>
            <strong>{health.wallet.address}</strong>
          </div>
          <div>
            <span>ETH BALANCE</span>
            <strong>{formatEth(health.wallet.ethBalanceWei)}</strong>
          </div>
          <div>
            <span>USDC BALANCE</span>
            <strong>{formatUsdc(health.wallet.usdcBalance)}</strong>
          </div>
          <div>
            <span>BASE BLOCK</span>
            <strong>#{health.wallet.blockNumber.toLocaleString()}</strong>
          </div>
        </section>
      ) : null}
      <section className="onboarding-panel" aria-labelledby="configure-heading">
        <div className="onboarding-copy">
          <p className="section-index">// SERVER-ONLY ONBOARDING</p>
          <h2 id="configure-heading">Connect the live stack</h2>
          <p>
            Credentials are submitted to a server action, encrypted with
            AES-256-GCM, and never returned to this page. Verification reads
            balances and contract code without broadcasting a transaction.
          </p>
          <ol>
            <li>
              <span>01</span>Create an organization key in KeeperHub.
            </li>
            <li>
              <span>02</span>Provide resilient Base and IPFS endpoints.
            </li>
            <li>
              <span>03</span>Receive the signed, no-write delivery probe.
            </li>
          </ol>
        </div>
        <form className="integration-form" action={action}>
          <input type="hidden" name="operation" value="configure" />
          <label>
            KeeperHub organization key
            <input
              name="keeperHubApiKey"
              type="password"
              autoComplete="off"
              placeholder="kh_••••••••••••"
              required
            />
          </label>
          <label>
            Base mainnet RPC
            <input
              name="baseRpcUrl"
              type="url"
              placeholder="https://base-mainnet.provider.example"
              required
            />
          </label>
          <label>
            IPFS gateway
            <input
              name="ipfsGatewayUrl"
              type="url"
              placeholder="https://gateway.example"
              required
            />
          </label>
          <label>
            Delivery webhook URL
            <input
              name="deliveryWebhookUrl"
              type="url"
              placeholder="https://api.example.com/webhooks/olas"
              required
            />
          </label>
          <label>
            Webhook signing secret
            <input
              name="deliveryWebhookSecret"
              type="password"
              minLength={32}
              autoComplete="new-password"
              placeholder="At least 32 characters"
              required
            />
          </label>
          <label>
            Olas Base subgraph <small>optional override</small>
            <input
              name="olasSubgraphUrl"
              type="url"
              placeholder="Official default"
            />
          </label>
          <p className="form-safety">
            READ-ONLY TEST · ZERO TRANSACTIONS · ZERO APPROVALS
          </p>
          <button className="primary-action" type="submit" disabled={pending}>
            {pending ? "ENCRYPTING + VERIFYING…" : "SAVE SECURELY + VERIFY"}
          </button>
        </form>
      </section>
    </div>
  );
}
