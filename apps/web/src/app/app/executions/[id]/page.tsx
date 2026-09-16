import { ProductPage } from "../../../../components/product-page";
import { loadProductPage } from "../../../../lib/page-data";
import { ChainFreshness } from "../../../../components/execution-ledger-filters";

export default async function ExecutionDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <ChainFreshness label={`Execution ${id}`} />
      <ProductPage state={await loadProductPage("execution-detail", id)} />
    </>
  );
}
