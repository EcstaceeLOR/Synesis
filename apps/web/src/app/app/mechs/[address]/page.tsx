import { ProductPage } from "../../../../components/product-page";
import { loadProductPage } from "../../../../lib/page-data";

export default async function MechDetailPage({
  params,
}: {
  readonly params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <ProductPage state={await loadProductPage("mech-detail", address)} />;
}
