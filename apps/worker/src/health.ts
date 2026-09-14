import { createServiceHealth, environmentSchema } from "@synesis/domain";
import { SYNESIS_COORDINATOR_QUEUE } from "@synesis/queue";

export function workerHealth() {
  return {
    ...createServiceHealth(
      "worker",
      environmentSchema.catch("demo").parse(process.env.SYNESIS_MODE),
      "0.1.0",
    ),
    queue: SYNESIS_COORDINATOR_QUEUE,
  };
}
