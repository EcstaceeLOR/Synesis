import {
  createPublicProofBundle,
  serializePublicProofBundle,
} from "@synesis/domain";

const createdAt = "2026-09-14T11:04:18.000Z";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ publicId: string }> },
): Promise<Response> {
  const { publicId } = await context.params;
  if (publicId !== "PRF-1041") {
    return Response.json(
      { error: { code: "PROOF_NOT_FOUND" } },
      { status: 404 },
    );
  }
  const bundle = await createPublicProofBundle({
    id: "proof-demo-1041",
    publicId,
    intentId: "SYN-1041",
    traceId: "trace-synesis-demo-1041",
    createdAt,
    artifacts: [
      {
        kind: "INTENT",
        label: "Frozen USDC supply intent",
        payload: {
          chainId: 8453,
          asset: "USDC",
          amountBaseUnits: "2500000000",
          strategy: "AAVE_V3_SUPPLY",
        },
        recordedAt: "2026-09-14T10:58:02.000Z",
      },
      {
        kind: "MECH_DELIVERY",
        label: "Two independent Olas deliveries",
        payload: {
          requestIds: ["OLAS-884", "OLAS-885"],
          validSchemas: true,
          distinctMechs: true,
        },
        recordedAt: "2026-09-14T11:01:42.000Z",
      },
      {
        kind: "POLICY",
        label: "Deterministic quorum report",
        payload: {
          version: "treasury-v4",
          outcome: "PASSED",
          quorum: "2/2",
          confidenceFloorBps: 7000,
        },
        recordedAt: "2026-09-14T11:02:07.000Z",
      },
      {
        kind: "SIMULATION",
        label: "KeeperHub exact-call simulation",
        payload: {
          chainId: 8453,
          target: "Aave V3 Pool",
          status: "PASSED",
          unchangedBroadcastPayload: true,
        },
        recordedAt: "2026-09-14T11:03:16.000Z",
      },
      {
        kind: "RECEIPT",
        label: "Verified Base receipt",
        payload: {
          keeperHubExecutionId: "KH-8831",
          receiptStatus: "success",
          verified: true,
          blockNumber: 35902184,
        },
        publicReference: "https://basescan.org",
        recordedAt: createdAt,
      },
      {
        kind: "POSITION_SNAPSHOT",
        label: "Aave position delta",
        payload: {
          asset: "aBasUSDC",
          deltaBaseUnits: "2500000000",
          expected: true,
        },
        recordedAt: createdAt,
      },
    ],
  });
  const url = new URL(request.url);
  if (url.searchParams.get("download") === "1") {
    return new Response(serializePublicProofBundle(bundle), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="${publicId}.json"`,
      },
    });
  }
  return Response.json({ valid: true, bundle });
}
