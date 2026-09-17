"use server";
import { callIntegrationApi } from "./server";
import type { IntegrationActionState } from "./types";
import { createDemoIntegrationHealth } from "./demo-health";
const value = (form: FormData, name: string): string => {
  const candidate = form.get(name);
  return typeof candidate === "string" ? candidate.trim() : "";
};
export async function manageIntegrations(
  previous: IntegrationActionState,
  form: FormData,
): Promise<IntegrationActionState> {
  try {
    if (process.env.SYNESIS_MODE !== "live") {
      return {
        status: "success",
        message:
          "Demo dependency checks passed. Live credentials were not stored and no transaction was sent.",
        health: createDemoIntegrationHealth(),
      };
    }
    if (value(form, "operation") === "recheck") {
      return {
        status: "success",
        message: "Live health checks refreshed.",
        health: await callIntegrationApi("/api/v1/integrations/olas/test"),
      };
    }
    const health = await callIntegrationApi(
      "/api/v1/integrations/keeperhub/test",
      {
        keeperHubApiKey: value(form, "keeperHubApiKey"),
        baseRpcUrl: value(form, "baseRpcUrl"),
        ipfsGatewayUrl: value(form, "ipfsGatewayUrl"),
        deliveryWebhookUrl: value(form, "deliveryWebhookUrl"),
        deliveryWebhookSecret: value(form, "deliveryWebhookSecret"),
        olasSubgraphUrl: value(form, "olasSubgraphUrl"),
      },
    );
    return {
      status: "success",
      message:
        health.readiness === "READY"
          ? "All live checks passed. This organization is ready."
          : "Settings were encrypted and saved. Resolve the failed checks before going live.",
      health,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Verification failed safely.",
      health: previous.health,
    };
  }
}
