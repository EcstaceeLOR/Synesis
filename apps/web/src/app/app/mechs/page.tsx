import { MechMarketplace } from "../../../components/mech-marketplace";
import { loadMechDirectory } from "../../../lib/mech-data";

export default async function MechsPage() {
  return <MechMarketplace state={await loadMechDirectory()} />;
}
