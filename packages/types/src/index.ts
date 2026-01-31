import { z } from "zod";

// ─── Task Schemas ───────────────────────────────────────────
export const CreateTaskSchema = z.object({
  name: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

// ─── Job Schemas ────────────────────────────────────────────
export const JobStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
  "retrying",
]);

export type JobStatus = z.infer<typeof JobStatusSchema>;

// ─── Event Types (Pub/Sub) ──────────────────────────────────
export const EventTypeSchema = z.enum([
  "task:created",
  "task:started",
  "task:completed",
  "task:failed",
  "job:progress",
  "notification:send",
  "order:created",
  "order:processing",
  "order:picked",
  "order:packed",
  "order:shipped",
  "order:completed",
  "inventory:updated",
  "picklist:generated",
  "picklist:item_picked",
  "picklist:completed",
  "packing:started",
  "packing:item_verified",
  "packing:completed",
  "shipping:label_created",
]);

export type EventType = z.infer<typeof EventTypeSchema>;

export interface PubSubEvent<T = unknown> {
  type: EventType;
  payload: T;
  timestamp: string;
  correlationId: string;
}

export interface TaskCreatedPayload {
  taskId: string;
  name: string;
  priority: string;
}

export interface TaskCompletedPayload {
  taskId: string;
  result: unknown;
  duration: number;
}

export interface TaskFailedPayload {
  taskId: string;
  error: string;
  attempt: number;
}

export interface JobProgressPayload {
  jobId: string;
  taskId: string;
  progress: number;
  message?: string;
}

// ─── Order Event Payloads ───────────────────────────────────
export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  customerName: string;
  totalAmount: number;
  itemCount: number;
  priority: string;
}

export interface OrderStatusPayload {
  orderId: string;
  orderNumber: string;
  status: string;
  previousStatus: string;
  message?: string;
}

export interface InventoryUpdatePayload {
  productId: string;
  sku: string;
  name: string;
  previousQty: number;
  newQty: number;
  reserved: number;
}

// ─── API Response Types ─────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    timestamp: string;
    correlationId: string;
  };
}

export interface PickListGeneratedPayload {
  pickListId: string;
  orderId: string;
  orderNumber: string;
  itemCount: number;
  items: { sku: string; name: string; quantity: number; location: string }[];
}

export interface PickItemPayload {
  pickListId: string;
  orderNumber: string;
  sku: string;
  name: string;
  quantity: number;
  location: string;
  progress: number; // e.g. "3 of 5 picked"
}

export interface PackingPayload {
  packingTaskId: string;
  orderNumber: string;
  status: string;
  weight?: number;
  dimensions?: { length: number; width: number; height: number };
}

export interface ShippingLabelPayload {
  labelId: string;
  orderId: string;
  orderNumber: string;
  carrier: string;
  service: string;
  trackingNumber: string;
  rate: number;
  estimatedDays: number;
}
