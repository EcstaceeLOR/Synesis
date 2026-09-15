import { ProductPage } from "../../../../components/product-page";
import { loadProductPage } from "../../../../lib/page-data";
import { LiveActivityStream } from "../../../../components/live-activity-stream";
import { IntentRoomActions } from "../../../../components/intent-room-actions";

export default async function IntentDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <LiveActivityStream />
      <IntentRoomActions intentId={id} />
      <ProductPage state={await loadProductPage("intent-detail", id)} />
    </>
  );
}
