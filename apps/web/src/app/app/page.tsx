import { ProductPage } from "../../components/product-page";
import { loadProductPage } from "../../lib/page-data";
import { LiveActivityStream } from "../../components/live-activity-stream";

export default async function CommandCenterPage() {
  return (
    <>
      <LiveActivityStream />
      <ProductPage state={await loadProductPage("command-center")} />
    </>
  );
}
