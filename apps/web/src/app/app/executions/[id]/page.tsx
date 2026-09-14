import { ProductPage } from "../../../../components/product-page";
import { loadProductPage } from "../../../../lib/page-data";

export default async function ExecutionDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductPage state={await loadProductPage("execution-detail", id)} />;
}
