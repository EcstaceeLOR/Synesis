import { ProductPage } from "../../components/product-page";
import { loadProductPage } from "../../lib/page-data";
import { LiveActivityStream } from "../../components/live-activity-stream";
import { SystemPulse } from "../../components/system-pulse";

export default async function CommandCenterPage() {
  return (
    <>
      <SystemPulse />
      <LiveActivityStream />
      <ProductPage state={await loadProductPage("command-center")} />
    </>
  );
}
