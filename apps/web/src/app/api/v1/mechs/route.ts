import { demoMechDirectory } from "../../../../lib/demo-data";

export function GET(): Response {
  return Response.json(demoMechDirectory, {
    headers: {
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
