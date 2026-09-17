import { ProductPage } from "../../../../components/product-page";
import { loadProductPage } from "../../../../lib/page-data";
import { SecurityControls } from "../../../../components/security-controls";

export default async function SecurityPage() {
  return (
    <>
      <ProductPage state={await loadProductPage("security")} />
      <div className="content-shell security-control-shell">
        <SecurityControls />
      </div>
    </>
  );
}
