import { ProductPage } from "../../components/product-page";
import { loadProductPage } from "../../lib/page-data";

export default async function CommandCenterPage() {
  return <ProductPage state={await loadProductPage("command-center")} />;
}
