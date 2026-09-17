import { demoActivity } from "../../../lib/demo-data";

export function GET(): Response {
  return Response.json({
    events: demoActivity,
    source: "synesis-api",
    updatedAt: new Date().toISOString(),
  });
}
