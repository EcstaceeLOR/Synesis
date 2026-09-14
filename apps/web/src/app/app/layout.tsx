import { AppShell } from "../../components/app-shell";
import type { ReactNode } from "react";

export default function ApplicationLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const mode = process.env.SYNESIS_MODE === "live" ? "live" : "demo";
  return <AppShell mode={mode}>{children}</AppShell>;
}
