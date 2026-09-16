import { readFile } from "node:fs/promises";

const ACK = "I_UNDERSTAND_LIVE_VALUE_MOVEMENT";
const apiOrigin = process.env.SYNESIS_API_ORIGIN;
const args = new Set(process.argv.slice(2));

const fail = (message) => {
  console.error(`Live acceptance refused: ${message}`);
  process.exitCode = 78;
};

const requireLiveGate = () => {
  if (process.env.SYNESIS_MODE !== "live") {
    fail("SYNESIS_MODE=live is required; no external writes were attempted");
    return false;
  }
  if (process.env.SYNESIS_LIVE_ACKNOWLEDGED !== ACK) {
    fail(
      `set SYNESIS_LIVE_ACKNOWLEDGED=${ACK}; no external writes were attempted`,
    );
    return false;
  }
  if (!apiOrigin) {
    fail("SYNESIS_API_ORIGIN must point at the deployed API");
    return false;
  }
  return true;
};

const requireString = (value, label) => {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${label} must be a non-empty string`);
};

const validateReport = (report) => {
  if (!report || typeof report !== "object")
    throw new Error("report must be an object");
  if (report.environment !== "live")
    throw new Error("report.environment must be live");
  if (report.chainId !== 8453)
    throw new Error("report.chainId must be Base mainnet (8453)");
  if (!Array.isArray(report.requests) || report.requests.length !== 2)
    throw new Error("exactly two paid Olas requests are required");
  if (!Array.isArray(report.deliveries) || report.deliveries.length !== 2)
    throw new Error("exactly two confirmed Olas deliveries are required");

  const requestIds = new Set();
  for (const [index, request] of report.requests.entries()) {
    requireString(
      request?.keeperhubExecutionId,
      `requests[${index}].keeperhubExecutionId`,
    );
    requireString(request?.txHash, `requests[${index}].txHash`);
    if (request.receiptStatus !== "success")
      throw new Error(
        `requests[${index}] does not have a verified successful receipt`,
      );
    if (requestIds.has(request.keeperhubExecutionId))
      throw new Error("duplicate Olas execution id");
    requestIds.add(request.keeperhubExecutionId);
  }
  for (const [index, delivery] of report.deliveries.entries()) {
    requireString(delivery?.requestId, `deliveries[${index}].requestId`);
    requireString(delivery?.contentHash, `deliveries[${index}].contentHash`);
    if (delivery.schemaValid !== true || delivery.integrityValid !== true)
      throw new Error(
        `deliveries[${index}] failed schema/integrity validation`,
      );
  }
  if (report.quorum?.passed !== true)
    throw new Error("deterministic quorum did not pass");
  requireString(report.quorum?.reportHash, "quorum.reportHash");
  if (report.execution?.strategy !== "AAVE_V3_USDC_SUPPLY")
    throw new Error("execution.strategy must be AAVE_V3_USDC_SUPPLY");
  requireString(
    report.execution?.keeperhubExecutionId,
    "execution.keeperhubExecutionId",
  );
  requireString(report.execution?.txHash, "execution.txHash");
  if (
    report.execution.receiptStatus !== "success" ||
    report.execution.positionDeltaObserved !== true
  )
    throw new Error(
      "Aave execution receipt or independently observed position delta is missing",
    );
  requireString(report.proof?.publicId, "proof.publicId");
  requireString(report.proof?.rootHash, "proof.rootHash");
  requireString(report.proof?.verificationUrl, "proof.verificationUrl");
  if (
    report.replay?.attempted !== true ||
    report.replay.accepted !== false ||
    report.replay.valueMoved !== false
  )
    throw new Error("replay safety invariant failed");

  const txHashes = [
    ...report.requests.map((request) => request.txHash),
    report.execution.txHash,
  ];
  if (new Set(txHashes).size !== txHashes.length)
    throw new Error("value-moving transaction hashes must be unique");
  return {
    chainId: report.chainId,
    requests: report.requests.length,
    deliveries: report.deliveries.length,
    proof: report.proof.publicId,
    replayValueMoved: report.replay.valueMoved,
  };
};

const preflight = async () => {
  const response = await fetch(new URL("/health", apiOrigin), {
    headers: process.env.SYNESIS_ACCEPTANCE_TOKEN
      ? { authorization: `Bearer ${process.env.SYNESIS_ACCEPTANCE_TOKEN}` }
      : undefined,
  });
  const health = await response.json();
  if (!response.ok || health.status === "error")
    throw new Error(`API health check failed (${response.status})`);
  return health;
};

if (!requireLiveGate()) process.exit();
try {
  const health = await preflight();
  console.info(`Live API preflight passed: ${health.service ?? "api"}`);
  const reportPath = process.env.SYNESIS_ACCEPTANCE_REPORT;
  if (!reportPath) {
    console.info(
      "No report supplied; preflight completed and no value movement was attempted.",
    );
    process.exit();
  }
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  console.info(
    `Acceptance report verified: ${JSON.stringify(validateReport(report))}`,
  );
  if (args.has("--execute")) {
    if (process.env.SYNESIS_ACCEPTANCE_ALLOW !== "1")
      throw new Error("--execute requires SYNESIS_ACCEPTANCE_ALLOW=1");
    console.info(
      "Report-only mode is complete; execution must be initiated through the approved API workflow.",
    );
  }
} catch (error) {
  fail(
    error instanceof Error ? error.message : "unexpected acceptance failure",
  );
}
