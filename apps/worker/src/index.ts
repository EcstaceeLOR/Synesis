import { workerHealth } from "./health.js";
import { startWorkerRuntime } from "./runtime.js";

process.stdout.write(`${JSON.stringify(workerHealth())}\n`);

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl) {
  throw new Error(
    "DATABASE_URL and REDIS_URL are required to start the worker",
  );
}

const runtime = startWorkerRuntime({ databaseUrl, redisUrl });
let closing = false;
const shutdown = (): void => {
  if (closing) return;
  closing = true;
  void runtime
    .close()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error("Worker shutdown failed", error);
      process.exit(1);
    });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
