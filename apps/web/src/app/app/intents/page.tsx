import { ProductPage } from "../../../components/product-page";
import { loadProductPage } from "../../../lib/page-data";

export default async function IntentsPage() {
  return <ProductPage state={await loadProductPage("intents")} />;
}
