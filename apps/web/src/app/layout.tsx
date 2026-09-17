import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Synesis", template: "%s · Synesis" },
  description: "Paid intelligence. Proven execution.",
  icons: { icon: "/synesis-mark.svg" },
  openGraph: {
    title: "Synesis — Paid intelligence. Proven execution.",
    description:
      "Olas agents trigger bounded KeeperHub value movement with verifiable evidence.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
