import { ProductPage } from "../../../components/product-page";
import { loadProductPage } from "../../../lib/page-data";
import { IntentListFilters } from "../../../components/intent-list-filters";

export default async function IntentsPage() {
  return (
    <>
      <IntentListFilters />
      <ProductPage state={await loadProductPage("intents")} />
    </>
  );
}
