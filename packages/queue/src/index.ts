import { Queue, Worker, Job, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { env } from "@wms/config";

// ─── Shared Redis Connection ────────────────────────────────
let _connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
    });
  }
  return _connection;
}

// ─── Queue Names ────────────────────────────────────────────
export const QUEUE_NAMES = {
  TASKS: "tasks",
  NOTIFICATIONS: "notifications",
  SCHEDULED: "scheduled",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Queue Factory ──────────────────────────────────────────
const queues = new Map<string, Queue>();

export function getQueue(name: QueueName): Queue {
  if (!queues.has(name)) {
    const queue = new Queue(name, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    });
    queues.set(name, queue);
  }
  return queues.get(name)!;
}

// ─── Worker Factory ─────────────────────────────────────────
export function createWorker<T = unknown>(
  name: QueueName,
  processor: (job: Job<T>) => Promise<unknown>,
  options?: { concurrency?: number }
): Worker<T> {
  const worker = new Worker<T>(name, processor, {
    connection: getRedisConnection(),
    concurrency: options?.concurrency ?? 5,
  });

  // Lifecycle logging
  worker.on("completed", (job) => {
    console.log(`✅ [${name}] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ [${name}] Job ${job?.id} failed:`, err.message);
  });

  worker.on("stalled", (jobId) => {
    console.warn(`⚠️ [${name}] Job ${jobId} stalled`);
  });

  return worker;
}

// ─── Queue Events (for monitoring) ──────────────────────────
export function createQueueEvents(name: QueueName): QueueEvents {
  return new QueueEvents(name, {
    connection: getRedisConnection(),
  });
}

// ─── Enqueue Helpers ────────────────────────────────────────
export async function enqueueTask(
  taskId: string,
  data: Record<string, unknown>,
  options?: { priority?: number; delay?: number }
) {
  const queue = getQueue(QUEUE_NAMES.TASKS);
  return queue.add(
    `process-task:${taskId}`,
    { taskId, ...data },
    {
      priority: options?.priority,
      delay: options?.delay,
      jobId: `task-${taskId}`, // Idempotent
    }
  );
}

export async function enqueueNotification(
  type: string,
  payload: Record<string, unknown>
) {
  const queue = getQueue(QUEUE_NAMES.NOTIFICATIONS);
  return queue.add(`notify:${type}`, { type, ...payload });
}

// ─── Cleanup ────────────────────────────────────────────────
export async function closeQueues() {
  for (const [name, queue] of queues) {
    await queue.close();
    console.log(`Queue ${name} closed`);
  }
  queues.clear();
  if (_connection) {
    _connection.disconnect();
    _connection = null;
  }
}

// Re-export BullMQ types for convenience
export type { Job, Worker, Queue } from "bullmq";
