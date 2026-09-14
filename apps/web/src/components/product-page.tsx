import {
  DataTable,
  MetricCard,
  StatePanel,
  StatusBadge,
  type DataColumn,
  type ViewState,
} from "@synesis/ui";
import Link from "next/link";

import type { PageRow, ProductPageModel } from "../lib/page-data";

const columns: readonly DataColumn<PageRow>[] = [
  {
    key: "record",
    label: "Record",
    render: (row) => (
      <div className="record-cell">
        <small>{row.id}</small>
        {row.href ? (
          <Link href={row.href}>{row.primary}</Link>
        ) : (
          <strong>{row.primary}</strong>
        )}
        <span>{row.secondary}</span>
      </div>
    ),
  },
  {
    key: "value",
    label: "Value",
    render: (row) => <strong>{row.value}</strong>,
    numeric: true,
  },
  {
    key: "evidence",
    label: "Evidence",
    render: (row) => <span className="mono-copy">{row.meta}</span>,
  },
  {
    key: "status",
    label: "Status",
    render: (row) => <StatusBadge tone={row.tone}>{row.status}</StatusBadge>,
  },
];

export function ProductPage({
  state,
}: {
  readonly state: ViewState<ProductPageModel>;
}) {
  const data = state.data;
  if (state.status !== "ready" && !data)
    return (
      <div className="content-shell">
        <StatePanel state={state} />
      </div>
    );
  if (!data) return null;

  return (
    <div className="content-shell">
      {state.status !== "ready" ? <StatePanel state={state} compact /> : null}
      <header className="page-heading">
        <div>
          <p className="app-eyebrow">{data.eyebrow}</p>
          <h1>{data.title}</h1>
          <p>{data.description}</p>
        </div>
        <div className="page-actions">
          <span>
            UPDATED
            <br />
            <strong>{data.updatedAt}</strong>
          </span>
          {data.primaryAction ? (
            <Link className="primary-action" href={data.primaryAction.href}>
              {data.primaryAction.label}
              <i aria-hidden="true">↗</i>
            </Link>
          ) : null}
        </div>
      </header>
      <section className="metric-grid" aria-label="Key metrics">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>
      <section className="data-section">
        <header>
          <div>
            <p className="section-index">// LIVE DATA</p>
            <h2>{data.listTitle}</h2>
            <p>{data.listDescription}</p>
          </div>
          <span className="data-contract">TYPED API BOUNDARY</span>
        </header>
        {data.rows.length === 0 ? (
          <StatePanel state={{ status: "empty" }} />
        ) : (
          <DataTable
            caption={data.listTitle}
            columns={columns}
            rows={data.rows}
            rowKey={(row) => row.id}
          />
        )}
      </section>
    </div>
  );
}
