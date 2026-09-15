import { MechProfile } from "../../../../components/mech-profile";
import { loadMech } from "../../../../lib/mech-data";

export default async function MechDetailPage({
  params,
}: {
  readonly params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <MechProfile state={await loadMech(address)} />;
}
