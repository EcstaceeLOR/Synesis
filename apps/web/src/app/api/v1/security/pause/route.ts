export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    paused?: unknown;
  } | null;
  if (typeof body?.paused !== "boolean") {
    return Response.json(
      { error: { code: "INVALID_PAUSE_STATE" } },
      { status: 400 },
    );
  }
  return Response.json({
    paused: body.paused,
    effectiveAt: new Date().toISOString(),
    mode: process.env.SYNESIS_MODE === "live" ? "live" : "demo",
    message: body.paused
      ? "Emergency pause engaged. New procurement and execution writes are blocked."
      : "Emergency pause cleared after an explicit owner action.",
  });
}
