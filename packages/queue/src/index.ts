import { intentStateSchema, type IntentState } from "@synesis/domain";
import {
  Queue,
  Worker,
  type ConnectionOptions,
  type JobsOptions,
} from "bullmq";

export const SYNESIS_COORDINATOR_QUEUE = "synesis-coordinator";
export const SYNESIS_BACKOFF_TYPE = "synesis-bounded-exponential";

export const COORDINATOR_RETRY_POLICY = Object.freeze({
  attempts: 6,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  jitter: 0.35,
});

export const INTENT_STATE_TIMEOUT_MS = Object.freeze({
  DRAFT: 5 * 60_000,
  QUOTING: 10 * 60_000,
  AWAITING_APPROVAL: 24 * 60 * 60_000,
  PROCUREMENT_READY: 5 * 60_000,
  PROCUREMENT_EXECUTING: 15 * 60_000,
  AWAITING_DELIVERIES: 2 * 60 * 60_000,
  EVALUATING: 10 * 60_000,
  REJECTED: 0,
  EXECUTION_READY: 10 * 60_000,
  AWAITING_FINAL_APPROVAL: 24 * 60 * 60_000,
  EXECUTING: 15 * 60_000,
  SUCCEEDED: 0,
  FAILED: 0,
  UNCONFIRMED: 30 * 60_000,
  EXPIRED: 0,
  CANCELLED: 0,
} satisfies Readonly<Record<IntentState, number>>);

export type CoordinatorJobName = "intent.advance" | "intent.reconcile";

export interface CoordinatorJobData {
  readonly schemaVersion: "1.0";
  readonly outboxId: string;
  readonly intentId: string;
  readonly traceId: string;
  readonly name: CoordinatorJobName;
  readonly state: IntentState;
  readonly stateVersion: number;
  readonly stateEnteredAt: string;
}

export interface CoordinatorJobContext {
  readonly attemptsMade: number;
  readonly signal: AbortSignal;
}

export const parseCoordinatorJobData = (input: unknown): CoordinatorJobData => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("Coordinator job data must be an object");
  }
  const data = input as Record<string, unknown>;
  if (
    data.schemaVersion !== "1.0" ||
    (data.name !== "intent.advance" && data.name !== "intent.reconcile") ||
    typeof data.outboxId !== "string" ||
    typeof data.intentId !== "string" ||
    typeof data.traceId !== "string" ||
    !Number.isInteger(data.stateVersion) ||
    (data.stateVersion as number) < 0 ||
    typeof data.stateEnteredAt !== "string" ||
    !Number.isFinite(Date.parse(data.stateEnteredAt))
  ) {
    throw new TypeError("Coordinator job data is malformed");
  }

  return {
    schemaVersion: "1.0",
    name: data.name,
    outboxId: data.outboxId,
    intentId: data.intentId,
    traceId: data.traceId,
    state: intentStateSchema.parse(data.state),
    stateVersion: data.stateVersion as number,
    stateEnteredAt: data.stateEnteredAt,
  };
};

export type CoordinatorProcessor = (
  data: CoordinatorJobData,
  context: CoordinatorJobContext,
) => Promise<void>;

export interface DurableCoordinatorQueue {
  publish(data: CoordinatorJobData): Promise<string>;
  has(jobId: string): Promise<boolean>;
  close(): Promise<void>;
  obliterate(): Promise<void>;
}

export interface DurableCoordinatorWorker {
  close(): Promise<void>;
}

export class StateDeadlineExceededError extends Error {
  public constructor(
    public readonly intentId: string,
    public readonly state: IntentState,
  ) {
    super(`Intent ${intentId} exceeded the ${state} state deadline`);
    this.name = "StateDeadlineExceededError";
  }
}

export const computeBoundedBackoff = (
  attemptsMade: number,
  random: () => number = Math.random,
): number => {
  const exponent = Math.max(0, Math.min(attemptsMade - 1, 30));
  const ceiling = Math.min(
    COORDINATOR_RETRY_POLICY.maxDelayMs,
    COORDINATOR_RETRY_POLICY.baseDelayMs * 2 ** exponent,
  );
  const jitterFloor = ceiling * (1 - COORDINATOR_RETRY_POLICY.jitter);
  const randomFraction = Math.max(0, Math.min(1, random()));
  return Math.round(
    jitterFloor + ceiling * COORDINATOR_RETRY_POLICY.jitter * randomFraction,
  );
};

export const getStateDeadline = (
  state: IntentState,
  stateEnteredAt: string,
): number => Date.parse(stateEnteredAt) + INTENT_STATE_TIMEOUT_MS[state];

const connectionFromUrl = (redisUrl: string): ConnectionOptions => {
  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new TypeError("REDIS_URL must use redis:// or rediss://");
  }

  const connection: ConnectionOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
  };
  if (url.username) connection.username = decodeURIComponent(url.username);
  if (url.password) connection.password = decodeURIComponent(url.password);
  if (url.pathname.length > 1) connection.db = Number(url.pathname.slice(1));
  if (url.protocol === "rediss:") connection.tls = {};
  return connection;
};

const durableJobOptions: JobsOptions = {
  attempts: COORDINATOR_RETRY_POLICY.attempts,
  backoff: { type: SYNESIS_BACKOFF_TYPE },
  removeOnComplete: { age: 7 * 24 * 60 * 60, count: 50_000 },
  removeOnFail: { age: 30 * 24 * 60 * 60, count: 100_000 },
};

export const outboxJobId = (outboxId: string): string =>
  `outbox-${outboxId.replaceAll(":", "-")}`;

export const createCoordinatorQueue = (options: {
  readonly redisUrl: string;
  readonly queueName?: string;
}): DurableCoordinatorQueue => {
  const queue = new Queue<CoordinatorJobData, void, CoordinatorJobName>(
    options.queueName ?? SYNESIS_COORDINATOR_QUEUE,
    {
      connection: connectionFromUrl(options.redisUrl),
      defaultJobOptions: durableJobOptions,
    },
  );

  return {
    publish: async (data) => {
      const jobId = outboxJobId(data.outboxId);
      await queue.add(data.name, data, { jobId });
      return jobId;
    },
    has: async (jobId) => (await queue.getJob(jobId)) !== undefined,
    close: () => queue.close(),
    obliterate: () => queue.obliterate({ force: true }),
  };
};

const runBeforeDeadline = async (
  data: CoordinatorJobData,
  attemptsMade: number,
  processor: CoordinatorProcessor,
): Promise<void> => {
  const remainingMs =
    data.name === "intent.reconcile"
      ? Math.max(1_000, INTENT_STATE_TIMEOUT_MS[data.state])
      : getStateDeadline(data.state, data.stateEnteredAt) - Date.now();
  if (remainingMs <= 0) {
    throw new StateDeadlineExceededError(data.intentId, data.state);
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new StateDeadlineExceededError(data.intentId, data.state));
    }, remainingMs);
  });

  try {
    await Promise.race([
      processor(data, { attemptsMade, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const createCoordinatorWorker = (options: {
  readonly redisUrl: string;
  readonly processor: CoordinatorProcessor;
  readonly queueName?: string;
  readonly concurrency?: number;
}): DurableCoordinatorWorker => {
  const worker = new Worker<CoordinatorJobData, void, CoordinatorJobName>(
    options.queueName ?? SYNESIS_COORDINATOR_QUEUE,
    (job) =>
      runBeforeDeadline(
        parseCoordinatorJobData(job.data),
        job.attemptsMade,
        options.processor,
      ),
    {
      connection: connectionFromUrl(options.redisUrl),
      concurrency: options.concurrency ?? 4,
      maxStalledCount: 2,
      settings: {
        backoffStrategy: (attemptsMade, type) => {
          if (type !== SYNESIS_BACKOFF_TYPE) {
            throw new Error(`Unsupported backoff strategy: ${type}`);
          }
          return computeBoundedBackoff(attemptsMade);
        },
      },
    },
  );

  return { close: () => worker.close() };
};
