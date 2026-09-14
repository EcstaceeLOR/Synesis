import type { ReactNode } from "react";

export const joinClassNames = (
  ...classNames: ReadonlyArray<string | false | null | undefined>
): string => classNames.filter(Boolean).join(" ");

export type OperationalState =
  | "loading"
  | "empty"
  | "partial"
  | "error"
  | "rejected"
  | "failed"
  | "unconfirmed";

export type ViewState<T> =
  | { readonly status: "ready"; readonly data: T }
  | {
      readonly status: OperationalState;
      readonly data?: T;
      readonly message?: string;
    };

export const OPERATIONAL_STATE_COPY: Readonly<
  Record<OperationalState, { readonly title: string; readonly message: string }>
> = {
  loading: {
    title: "Loading live data",
    message: "Synesis is refreshing this view.",
  },
  empty: {
    title: "Nothing here yet",
    message: "New records will appear here when they are created.",
  },
  partial: {
    title: "Partial data",
    message: "Some sources have not finished reporting.",
  },
  error: {
    title: "Data unavailable",
    message: "The source could not be reached. Try again shortly.",
  },
  rejected: {
    title: "Rejected safely",
    message: "Guardrails prevented this operation from proceeding.",
  },
  failed: {
    title: "Execution failed",
    message: "No confirmed value movement was recorded.",
  },
  unconfirmed: {
    title: "Awaiting confirmation",
    message: "The operation is submitted but is not final yet.",
  },
};

export interface EnvironmentBadgeProps {
  readonly mode: "demo" | "live";
}

export function EnvironmentBadge({ mode }: EnvironmentBadgeProps) {
  const isLive = mode === "live";
  return (
    <span
      className={joinClassNames(
        "syn-environment",
        isLive && "syn-environment--live",
      )}
      aria-label={
        isLive
          ? "Live environment on Base mainnet"
          : "Demo environment with no value movement"
      }
    >
      <i aria-hidden="true" />
      {isLive ? "LIVE / BASE MAINNET" : "DEMO / NO VALUE"}
    </span>
  );
}

export interface StatusBadgeProps {
  readonly tone?: "neutral" | "positive" | "warning" | "danger" | "info";
  readonly children: ReactNode;
}

export function StatusBadge({ tone = "neutral", children }: StatusBadgeProps) {
  return <span className={`syn-status syn-status--${tone}`}>{children}</span>;
}

export interface MetricCardProps {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly accent?: boolean;
}

export function MetricCard({
  label,
  value,
  detail,
  accent = false,
}: MetricCardProps) {
  return (
    <article className={joinClassNames("syn-metric", accent && "is-accent")}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

export interface StatePanelProps<T> {
  readonly state: Exclude<ViewState<T>, { readonly status: "ready" }>;
  readonly compact?: boolean;
}

export function StatePanel<T>({ state, compact = false }: StatePanelProps<T>) {
  const copy = OPERATIONAL_STATE_COPY[state.status];
  return (
    <section
      className={joinClassNames(
        "syn-state-panel",
        `syn-state-panel--${state.status}`,
        compact && "is-compact",
      )}
      role={
        state.status === "error" || state.status === "failed"
          ? "alert"
          : "status"
      }
      aria-live="polite"
    >
      {state.status === "loading" ? (
        <span className="syn-spinner" aria-hidden="true" />
      ) : (
        <span className="syn-state-mark" aria-hidden="true">
          {state.status.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div>
        <strong>{copy.title}</strong>
        <p>{state.message ?? copy.message}</p>
      </div>
    </section>
  );
}

export interface DataColumn<Row> {
  readonly key: string;
  readonly label: string;
  readonly render: (row: Row) => ReactNode;
  readonly numeric?: boolean;
}

export interface DataTableProps<Row> {
  readonly caption: string;
  readonly columns: readonly DataColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
}: DataTableProps<Row>) {
  return (
    <div
      className="syn-table-wrap"
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="syn-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.numeric ? "is-numeric" : undefined}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.numeric ? "is-numeric" : undefined}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LoadingSkeleton({ rows = 3 }: { readonly rows?: number }) {
  return (
    <div className="syn-skeleton" role="status" aria-label="Loading content">
      {Array.from({ length: rows }, (_, index) => (
        <i key={index} aria-hidden="true" />
      ))}
    </div>
  );
}
