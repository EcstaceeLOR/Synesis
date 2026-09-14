import { createSynesisStore } from "@synesis/database";
import {
  createCoordinatorQueue,
  createCoordinatorWorker,
  type CoordinatorJobData,
} from "@synesis/queue";

import {
  createLockedCoordinatorProcessor,
  OutboxPublisher,
  ReconciliationService,
  type LockedIntentHandler,
} from "./coordinator.js";

export interface WorkerRuntime {
  close(): Promise<void>;
}

const infrastructureReadyHandler: LockedIntentHandler = () => {
  // State-specific integrations register their durable effects in issues #9 onward.
  // Reaching this handler proves the job is current and owns the intent lock.
  return Promise.resolve();
};

export const startWorkerRuntime = (options: {
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly workerId?: string;
  readonly queueName?: string;
  readonly publishIntervalMs?: number;
  readonly reconciliationIntervalMs?: number;
  readonly handlers?: Readonly<
    Record<CoordinatorJobData["name"], LockedIntentHandler>
  >;
}): WorkerRuntime => {
  const store = createSynesisStore({ connectionString: options.databaseUrl });
  const queue = createCoordinatorQueue({
    redisUrl: options.redisUrl,
    ...(options.queueName ? { queueName: options.queueName } : {}),
  });
  const handlers = options.handlers ?? {
    "intent.advance": infrastructureReadyHandler,
    "intent.reconcile": infrastructureReadyHandler,
  };
  const worker = createCoordinatorWorker({
    redisUrl: options.redisUrl,
    ...(options.queueName ? { queueName: options.queueName } : {}),
    processor: createLockedCoordinatorProcessor({ store, handlers }),
  });
  const publisher = new OutboxPublisher(store, queue, {
    workerId: options.workerId ?? `worker-${process.pid}`,
  });
  const reconciler = new ReconciliationService(store);
  let publisherCycle: Promise<void> | undefined;
  let reconciliationCycle: Promise<void> | undefined;

  const runPublisher = (): void => {
    if (publisherCycle) return;
    publisherCycle = publisher
      .drainOnce()
      .then(() => undefined)
      .catch((error: unknown) => {
        console.error("Outbox publish cycle failed", error);
      })
      .finally(() => {
        publisherCycle = undefined;
      });
  };
  const runReconciler = (): void => {
    if (reconciliationCycle) return;
    reconciliationCycle = reconciler
      .runOnce()
      .then(() => undefined)
      .catch((error: unknown) => {
        console.error("Reconciliation cycle failed", error);
      })
      .finally(() => {
        reconciliationCycle = undefined;
      });
  };

  runPublisher();
  runReconciler();
  const publishTimer = setInterval(
    runPublisher,
    options.publishIntervalMs ?? 1_000,
  );
  const reconciliationTimer = setInterval(
    runReconciler,
    options.reconciliationIntervalMs ?? 30_000,
  );

  return {
    close: async () => {
      clearInterval(publishTimer);
      clearInterval(reconciliationTimer);
      await Promise.all([publisherCycle, reconciliationCycle]);
      await worker.close();
      await queue.close();
      await store.close();
    },
  };
};
