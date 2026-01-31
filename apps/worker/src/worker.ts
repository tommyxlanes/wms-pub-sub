// 1. Load env FIRST
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(import.meta.dirname, "../../../.env") });

// 2. Now import everything
import { createWorker, QUEUE_NAMES, closeQueues } from "@wms/queue";
import { subscribe, CHANNELS, closePubSub } from "@wms/pubsub";
import { processTask } from "./processors/task.processor.js";
import { processNotification } from "./processors/notification.processor.js";
import { processOrderFulfillment } from "./processors/order.processor.js";

async function main() {
  console.log("🚀 Starting worker...\n");

  // ─── Register BullMQ Workers ────────────────────────────────
  // Route jobs based on their data.type field
  const taskWorker = createWorker(
    QUEUE_NAMES.TASKS,
    async (job: any) => {
      if (job.data.type === "order-fulfillment") {
        return processOrderFulfillment(job);
      }
      return processTask(job);
    },
    {
      concurrency: 3,
    },
  );

  const notificationWorker = createWorker(
    QUEUE_NAMES.NOTIFICATIONS,
    processNotification,
    { concurrency: 5 },
  );

  console.log("✅ Workers registered:");
  console.log(`   - ${QUEUE_NAMES.TASKS} (concurrency: 3)`);
  console.log(`   - ${QUEUE_NAMES.NOTIFICATIONS} (concurrency: 5)`);

  // ─── Subscribe to Pub/Sub Events ────────────────────────────
  await subscribe(CHANNELS.TASKS, (event) => {
    console.log(`📡 [Worker PubSub] ${event.type} — ${event.correlationId}`);

    // React to events — e.g., trigger follow-up jobs
    if (event.type === "task:completed") {
      console.log("   → Could trigger follow-up notification here");
    }
  });

  await subscribe(CHANNELS.SYSTEM, (event) => {
    console.log(`⚙️ [System Event] ${event.type}`);
  });

  console.log("\n👂 Pub/Sub subscriptions active");
  console.log("⏳ Waiting for jobs...\n");

  // ─── Graceful Shutdown ──────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down worker...`);

    await taskWorker.close();
    await notificationWorker.close();
    await closePubSub();
    await closeQueues();

    console.log("Worker shut down cleanly");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("❌ Failed to start worker:", err);
  process.exit(1);
});
