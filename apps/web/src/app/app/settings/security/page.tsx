import { ProductPage } from "../../../../components/product-page";
import { loadProductPage } from "../../../../lib/page-data";

export default async function SecurityPage() {
  return <ProductPage state={await loadProductPage("security")} />;
}
