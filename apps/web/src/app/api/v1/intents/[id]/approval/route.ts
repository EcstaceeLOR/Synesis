import { createHash } from "node:crypto";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    decision?: unknown;
  } | null;
  if (body?.decision !== "approve" && body?.decision !== "reject") {
    return Response.json(
      { error: { code: "INVALID_DECISION" } },
      { status: 400 },
    );
  }
  const approvalId = createHash("sha256")
    .update(`${id}:${body.decision}`, "utf8")
    .digest("hex")
    .slice(0, 16);
  return Response.json({
    approvalId: `APR-${approvalId}`,
    intentId: id,
    decision: body.decision,
    state: body.decision === "approve" ? "PROCUREMENT_READY" : "CANCELLED",
    idempotent: true,
    message:
      body.decision === "approve"
        ? "Approval recorded. The bounded procurement plan is ready."
        : "Intent rejected before value movement.",
  });
}
