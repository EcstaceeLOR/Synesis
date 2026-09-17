import { hashCanonicalJson } from "@synesis/domain";
import { randomUUID } from "node:crypto";

const isAddress = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-fA-F]{40}$/u.test(value);

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const amount = body?.amount;
  const expiryHours = body?.expiryHours;
  const mechAddresses = body?.mechAddresses;
  if (
    typeof amount !== "string" ||
    !/^[1-9]\d*$/u.test(amount) ||
    BigInt(amount) > 10_000_000_000n ||
    typeof expiryHours !== "number" ||
    ![1, 24, 72].includes(expiryHours) ||
    !Array.isArray(mechAddresses) ||
    mechAddresses.length !== 2 ||
    !mechAddresses.every(isAddress) ||
    mechAddresses[0]?.toLowerCase() === mechAddresses[1]?.toLowerCase()
  ) {
    return Response.json(
      {
        error: {
          code: "INVALID_INTENT",
          message:
            "Provide a bounded amount, expiry, and two independent Mechs.",
        },
      },
      { status: 400 },
    );
  }
  const id = `SYN-${randomUUID().slice(0, 8).toUpperCase()}`;
  const createdAt = new Date();
  const intent = {
    id,
    strategy: "AAVE_V3_USDC_SUPPLY",
    chainId: 8453,
    asset: "USDC",
    amount,
    mechAddresses,
    policyVersion: "treasury-v4",
    state: "AWAITING_APPROVAL",
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(
      createdAt.getTime() + expiryHours * 3_600_000,
    ).toISOString(),
  } as const;
  return Response.json(
    {
      intent: { ...intent, snapshotHash: await hashCanonicalJson(intent) },
      next: `/app/intents/${id}`,
      message:
        "Intent frozen. No value moved; approval is required before procurement.",
    },
    { status: 201, headers: { "x-synesis-mode": "demo" } },
  );
}

export function GET(): Response {
  return Response.json({
    intents: [
      { id: "SYN-1042", state: "AWAITING_APPROVAL", amount: "5000000000" },
      { id: "SYN-1041", state: "SUCCEEDED", amount: "2500000000" },
      { id: "SYN-1039", state: "REJECTED", amount: "4000000000" },
    ],
    source: "demo-seed",
  });
}
