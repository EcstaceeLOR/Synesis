"use client";

import type { DiscoveredMech, MechDirectory } from "@synesis/domain";
import {
  DataTable,
  MetricCard,
  StatePanel,
  StatusBadge,
  type DataColumn,
  type ViewState,
} from "@synesis/ui";
import Link from "next/link";
import { useMemo, useState } from "react";

const shortAddress = (address: string) =>
  `${address.slice(0, 8)}…${address.slice(-6)}`;
const price = (mech: DiscoveredMech) => {
  if (mech.unitAmount === null) return "Unavailable";
  const symbol = mech.paymentType === "USDC_TOKEN" ? "USDC" : "ETH";
  return `${(mech.unitAmount / 10 ** mech.paymentDecimals).toLocaleString(
    undefined,
    {
      maximumFractionDigits: 6,
    },
  )} ${symbol}`;
};

const columns: readonly DataColumn<DiscoveredMech>[] = [
  {
    key: "provider",
    label: "Provider",
    render: (mech) => (
      <div className="record-cell mech-record">
        <small>#{mech.serviceId}</small>
        <Link href={`/app/mechs/${mech.address}`}>{mech.name}</Link>
        <span className="mono-copy">{shortAddress(mech.address)}</span>
      </div>
    ),
  },
  {
    key: "tools",
    label: "Pinned tools",
    render: (mech) => (
      <span>
        {mech.tools.length
          ? mech.tools.map((tool) => tool.name).join(", ")
          : "None"}
      </span>
    ),
  },
  {
    key: "payment",
    label: "Payment / price",
    render: (mech) => (
      <strong>
        {mech.paymentType ?? "Unknown"}
        <br />
        {price(mech)}
      </strong>
    ),
  },
  {
    key: "history",
    label: "Delivery history",
    render: (mech) => (
      <span>{mech.totalDeliveries.toLocaleString()} confirmed</span>
    ),
    numeric: true,
  },
  {
    key: "score",
    label: "Score",
    render: (mech) => <strong>{mech.compatibilityScore}/100</strong>,
    numeric: true,
  },
  {
    key: "status",
    label: "Compatibility",
    render: (mech) => (
      <StatusBadge
        tone={
          mech.eligible
            ? "positive"
            : mech.health === "degraded"
              ? "warning"
              : "danger"
        }
      >
        {mech.eligible ? "ELIGIBLE" : "REJECTED"}
      </StatusBadge>
    ),
  },
];

export function MechMarketplace({
  state,
}: {
  readonly state: ViewState<MechDirectory>;
}) {
  const [query, setQuery] = useState("");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const data = state.data;
  const mechs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.mechs ?? []).filter(
      (mech) =>
        (!eligibleOnly || mech.eligible) &&
        (!normalized ||
          mech.name.toLowerCase().includes(normalized) ||
          mech.address.toLowerCase().includes(normalized) ||
          String(mech.serviceId).includes(normalized) ||
          mech.tools.some((tool) =>
            tool.name.toLowerCase().includes(normalized),
          )),
    );
  }, [data, eligibleOnly, query]);
  const eligible = data?.mechs.filter((mech) => mech.eligible).length ?? 0;
  const active =
    data?.mechs.filter((mech) => mech.health === "active").length ?? 0;

  return (
    <div className="content-shell">
      <header className="page-heading">
        <div>
          <p className="app-eyebrow">Decision network / Olas / Base</p>
          <h1>Live Mech marketplace</h1>
          <p>
            Official Olas discovery, verified contract identity, immutable tool
            schemas, payment facts, and fail-closed compatibility.
          </p>
        </div>
        <div className="page-actions">
          <span>
            OBSERVED
            <br />
            <strong>
              {data
                ? new Date(data.observedAt).toLocaleString()
                : "Not available"}
            </strong>
          </span>
        </div>
      </header>
      {state.status !== "ready" ? (
        <StatePanel state={state} compact={Boolean(data)} />
      ) : null}
      <section className="metric-grid" aria-label="Marketplace metrics">
        <MetricCard
          label="Discovered"
          value={String(data?.mechs.length ?? 0).padStart(2, "0")}
          detail="Official Base marketplace"
        />
        <MetricCard
          label="Eligible"
          value={String(eligible).padStart(2, "0")}
          detail="Fixed-price USDC + pinned schema"
          accent
        />
        <MetricCard
          label="Active contracts"
          value={String(active).padStart(2, "0")}
          detail="Code, identity, and history"
        />
        <MetricCard
          label="Observed version"
          value={data?.observedVersion ?? "—"}
          detail="Frozen into intent selections"
        />
      </section>
      <section className="data-section">
        <header>
          <div>
            <p className="section-index">// LIVE, NO FIXTURES</p>
            <h2>Discovered intelligence providers</h2>
            <p>
              Rejected providers remain visible with exact evidence; only
              eligible and independent addresses can enter an intent.
            </p>
          </div>
          <span className="data-contract">OLAS MECH-CLIENT</span>
        </header>
        {data ? (
          <div className="mech-toolbar">
            <label>
              Search address, service, or tool
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="0x… or risk"
              />
            </label>
            <label className="mech-check">
              <input
                type="checkbox"
                checked={eligibleOnly}
                onChange={(event) => setEligibleOnly(event.target.checked)}
              />{" "}
              Eligible only
            </label>
          </div>
        ) : null}
        {data && mechs.length ? (
          <DataTable
            caption="Live Olas Mechs"
            columns={columns}
            rows={mechs}
            rowKey={(mech) => mech.address}
          />
        ) : data ? (
          <StatePanel
            state={{
              status: "empty",
              message: "No live Mechs match these filters.",
            }}
          />
        ) : null}
      </section>
    </div>
  );
}
