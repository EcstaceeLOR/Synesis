import { EnvironmentBadge } from "@synesis/ui";
import Link from "next/link";

import { ProductPage } from "../../../components/product-page";
import { loadProductPage } from "../../../lib/page-data";
import { PublicProofVerifier } from "../../../components/public-proof-verifier";

export default async function PublicProofPage({
  params,
}: {
  readonly params: Promise<{ proofId: string }>;
}) {
  const { proofId } = await params;
  const mode = process.env.SYNESIS_MODE === "live" ? "live" : "demo";
  return (
    <main className="public-proof-shell">
      <nav aria-label="Public proof navigation">
        <Link className="app-brand" href="/">
          <span>S</span>
          <strong>SYNESIS</strong>
          <small>Public verifier</small>
        </Link>
        <EnvironmentBadge mode={mode} />
      </nav>
      {mode === "live" ? (
        <PublicProofVerifier proofId={proofId} />
      ) : (
        <ProductPage state={await loadProductPage("proof-detail", proofId)} />
      )}
    </main>
  );
}
