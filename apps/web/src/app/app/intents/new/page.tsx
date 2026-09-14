import { ProductPage } from "../../../../components/product-page";
import { loadProductPage } from "../../../../lib/page-data";

export default async function NewIntentPage() {
  return <ProductPage state={await loadProductPage("new-intent")} />;
}
