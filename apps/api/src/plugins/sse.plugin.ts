import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { subscribe, CHANNELS } from "@wms/pubsub";
import type { PubSubEvent } from "@wms/types";

// Track connected SSE clients
const clients = new Set<FastifyReply>();

export async function ssePlugin(app: FastifyInstance) {
  // ─── SSE Endpoint ───────────────────────────────────────────
  app.get("/events", async (request: FastifyRequest, reply: FastifyReply) => {
    // Set SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send initial connection event
    reply.raw.write(
      `data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`
    );

    clients.add(reply);
    app.log.info(`SSE client connected (${clients.size} total)`);

    // Cleanup on disconnect
    request.raw.on("close", () => {
      clients.delete(reply);
      app.log.info(`SSE client disconnected (${clients.size} total)`);
    });

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 15000);

    request.raw.on("close", () => clearInterval(heartbeat));
  });

  // ─── Subscribe to all channels and broadcast to SSE clients ─
  await subscribe(CHANNELS.TASKS, (event) => broadcast(event));
  await subscribe(CHANNELS.NOTIFICATIONS, (event) => broadcast(event));
  await subscribe(CHANNELS.SYSTEM, (event) => broadcast(event));

  app.log.info("SSE plugin registered — listening on GET /events");
}

function broadcast(event: PubSubEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    client.raw.write(data);
  }
}
