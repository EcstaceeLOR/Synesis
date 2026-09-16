import { ProductPage } from "../../../components/product-page";
import { loadProductPage } from "../../../lib/page-data";
import { ExecutionLedgerFilters } from "../../../components/execution-ledger-filters";

export default async function ExecutionsPage() {
  return (
    <>
      <ExecutionLedgerFilters />
      <ProductPage state={await loadProductPage("executions")} />
    </>
  );
}
