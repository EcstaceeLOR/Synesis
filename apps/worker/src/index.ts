import { workerHealth } from "./health.js";

process.stdout.write(`${JSON.stringify(workerHealth())}\n`);
