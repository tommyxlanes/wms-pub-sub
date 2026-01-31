// 1. Load env FIRST
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(import.meta.dirname, "../../../.env") });

// 2. Now safe to import everything else
import { env } from "@wms/config";
import { subscribe, CHANNELS, closePubSub } from "@wms/pubsub";
import { closeQueues } from "@wms/queue";
import { buildApp } from "./app.js";

async function main() {
  const app = await buildApp();

  // ─── Subscribe to events (API can listen too) ─────────────
  await subscribe(CHANNELS.TASKS, (event) => {
    app.log.info({ event: event.type, id: event.correlationId }, "📡 Event received in API");
  });

  // ─── Start server ─────────────────────────────────────────
  await app.listen({ port: env.PORT, host: env.HOST });

  // ─── Graceful shutdown ────────────────────────────────────
  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down...`);
    await app.close();
    await closePubSub();
    await closeQueues();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("❌ Failed to start API:", err);
  process.exit(1);
});
