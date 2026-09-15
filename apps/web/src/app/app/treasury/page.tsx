import { ProductPage } from "../../../components/product-page";
import { loadProductPage } from "../../../lib/page-data";
import { ChainFreshness } from "../../../components/execution-ledger-filters";

export default async function TreasuryPage() {
  return (
    <>
      <ChainFreshness label="Treasury balances" />
      <ProductPage state={await loadProductPage("treasury")} />
    </>
  );
}
