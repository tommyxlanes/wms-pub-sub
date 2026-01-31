import IORedis from "ioredis";
import { randomUUID } from "node:crypto";
import { env } from "@wms/config";
import type { PubSubEvent, EventType } from "@wms/types";

// ─── Dedicated Pub/Sub Connections ──────────────────────────
// Redis requires separate connections for pub and sub
let _publisher: IORedis | null = null;
let _subscriber: IORedis | null = null;

function getPublisher(): IORedis {
  if (!_publisher) {
    _publisher = new IORedis(env.REDIS_URL);
  }
  return _publisher;
}

function getSubscriber(): IORedis {
  if (!_subscriber) {
    _subscriber = new IORedis(env.REDIS_URL);
  }
  return _subscriber;
}

// ─── Channel Names ──────────────────────────────────────────
export const CHANNELS = {
  TASKS: "channel:tasks",
  NOTIFICATIONS: "channel:notifications",
  SYSTEM: "channel:system",
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

// ─── Event Handler Registry ─────────────────────────────────
type EventHandler<T = unknown> = (event: PubSubEvent<T>) => void | Promise<void>;
const handlers = new Map<string, Set<EventHandler>>();

// ─── Publish ────────────────────────────────────────────────
export async function publish<T>(
  channel: Channel,
  type: EventType,
  payload: T,
  correlationId?: string
): Promise<void> {
  const event: PubSubEvent<T> = {
    type,
    payload,
    timestamp: new Date().toISOString(),
    correlationId: correlationId ?? randomUUID(),
  };

  const message = JSON.stringify(event);
  await getPublisher().publish(channel, message);
  console.log(`📡 [PUB] ${channel} → ${type} (${event.correlationId})`);
}

// ─── Subscribe ──────────────────────────────────────────────
export async function subscribe(
  channel: Channel,
  handler: EventHandler
): Promise<void> {
  const sub = getSubscriber();

  if (!handlers.has(channel)) {
    handlers.set(channel, new Set());

    // Only subscribe to Redis channel once
    await sub.subscribe(channel);
    console.log(`👂 [SUB] Listening on ${channel}`);

    sub.on("message", (ch, message) => {
      if (ch !== channel) return;
      try {
        const event = JSON.parse(message) as PubSubEvent;
        const channelHandlers = handlers.get(channel);
        if (channelHandlers) {
          for (const h of channelHandlers) {
            Promise.resolve(h(event)).catch((err) => {
              console.error(`❌ [SUB] Handler error on ${channel}:`, err);
            });
          }
        }
      } catch (err) {
        console.error(`❌ [SUB] Parse error on ${channel}:`, err);
      }
    });
  }

  handlers.get(channel)!.add(handler);
}

// ─── Unsubscribe ────────────────────────────────────────────
export async function unsubscribe(
  channel: Channel,
  handler?: EventHandler
): Promise<void> {
  const channelHandlers = handlers.get(channel);
  if (!channelHandlers) return;

  if (handler) {
    channelHandlers.delete(handler);
  } else {
    channelHandlers.clear();
  }

  if (channelHandlers.size === 0) {
    await getSubscriber().unsubscribe(channel);
    handlers.delete(channel);
    console.log(`🔇 [SUB] Unsubscribed from ${channel}`);
  }
}

// ─── Cleanup ────────────────────────────────────────────────
export async function closePubSub(): Promise<void> {
  if (_subscriber) {
    await _subscriber.unsubscribe();
    _subscriber.disconnect();
    _subscriber = null;
  }
  if (_publisher) {
    _publisher.disconnect();
    _publisher = null;
  }
  handlers.clear();
  console.log("PubSub connections closed");
}
