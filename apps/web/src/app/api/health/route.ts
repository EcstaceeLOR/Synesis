import { createServiceHealth } from "@synesis/domain";

export function GET(): Response {
  return Response.json(createServiceHealth("web", "demo", "0.1.0"));
}
