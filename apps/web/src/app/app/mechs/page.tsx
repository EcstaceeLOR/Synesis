import { ProductPage } from "../../../components/product-page";
import { loadProductPage } from "../../../lib/page-data";

export default async function MechsPage() {
  return <ProductPage state={await loadProductPage("mechs")} />;
}
