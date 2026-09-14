import { IntegrationConsole } from "./integration-console";
import { loadIntegrationHealth } from "./server";

export default async function IntegrationsPage() {
  const health = await loadIntegrationHealth();
  return (
    <div className="content-shell">
      <header className="page-heading">
        <div>
          <p className="app-eyebrow">SETTINGS / INTEGRATIONS</p>
          <h1>Control plane</h1>
          <p>
            Prove that every dependency required for paid agent execution is
            live, compatible, and safe.
          </p>
        </div>
        <div className="page-actions">
          <span>
            NETWORK
            <br />
            <strong>BASE · 8453</strong>
          </span>
        </div>
      </header>
      <IntegrationConsole initialHealth={health} />
    </div>
  );
}
