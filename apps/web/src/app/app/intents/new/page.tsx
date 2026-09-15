import { IntentMechSelector } from "../../../../components/intent-mech-selector";
import { ProductPage } from "../../../../components/product-page";
import { loadMechDirectory } from "../../../../lib/mech-data";
import { loadProductPage } from "../../../../lib/page-data";

export default async function NewIntentPage() {
  const [page, directory] = await Promise.all([
    loadProductPage("new-intent"),
    loadMechDirectory(),
  ]);
  return (
    <>
      <ProductPage state={page} />
      <div className="content-shell intent-selector-shell">
        <IntentMechSelector state={directory} />
      </div>
    </>
  );
}
