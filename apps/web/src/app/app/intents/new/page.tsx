import { IntentComposer } from "../../../../components/intent-composer";
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
        {directory.data ? <IntentComposer directory={directory.data} /> : null}
      </div>
    </>
  );
}
