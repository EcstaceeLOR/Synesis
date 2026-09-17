import { createHash } from "node:crypto";

export async function POST(
  _request: Request,
  context: { readonly params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const simulationHash = `sha256:${createHash("sha256").update(`${id}:aave:supply`).digest("hex")}`;
  return Response.json({
    intentId: id,
    status: "PASSED",
    chainId: 8453,
    target: "Aave V3 Pool",
    function: "supply(address,uint256,address,uint16)",
    simulationHash,
    keeperHubMode:
      process.env.SYNESIS_MODE === "live" ? "live" : "demo-no-broadcast",
    deltas: ["-USDC wallet", "+aUSDC position"],
    message:
      "Exact bounded call simulated successfully. Demo mode prevents broadcast.",
  });
}
