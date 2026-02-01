import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { taskRoutes } from "./routes/tasks.routes.js";
import { orderRoutes } from "./routes/orders.routes.js";
import { fulfillmentRoutes } from "./routes/fulfillment.routes.js";

import { ssePlugin } from "./plugins/sse.plugin.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    },
  });

  // Plugins
  await app.register(cors, { origin: true });

  // Serve static dashboard
  await app.register(fastifyStatic, {
    root: path.resolve(import.meta.dirname, "../public"),
    prefix: "/",
  });

  // SSE — real-time event stream
  await app.register(ssePlugin);

  // Health check
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  // Routes
  await app.register(taskRoutes, { prefix: "/api/tasks" });
  await app.register(orderRoutes, { prefix: "/api/orders" });
  await app.register(fulfillmentRoutes, { prefix: "/api/fulfill" });

  return app;
}
