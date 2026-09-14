import { ProductPage } from "../../../components/product-page";
import { loadProductPage } from "../../../lib/page-data";

export default async function TreasuryPage() {
  return <ProductPage state={await loadProductPage("treasury")} />;
}
