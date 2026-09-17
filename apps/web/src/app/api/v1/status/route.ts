import { demoMechDirectory } from "../../../../lib/demo-data";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({
    service: "synesis-api",
    status: "ok",
    environment: process.env.SYNESIS_MODE === "live" ? "live" : "demo",
    version: "0.2.0",
    checkedAt: new Date().toISOString(),
    capabilities: {
      intentCreation: true,
      approvals: true,
      mechDiscovery: true,
      keeperHubExecution: process.env.SYNESIS_MODE === "live",
      proofVerification: true,
    },
    dependencies: [
      { name: "web-bff", status: "ready" },
      {
        name: "olas-directory",
        status: "ready",
        count: demoMechDirectory.mechs.length,
      },
      {
        name: "keeperhub",
        status:
          process.env.SYNESIS_MODE === "live" ? "configured" : "demo-guarded",
      },
    ],
  });
}
