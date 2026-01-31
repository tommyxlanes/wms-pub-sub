import { randomUUID } from "node:crypto";
import { taskRepository, eventRepository } from "@wms/db";
import { enqueueTask } from "@wms/queue";
import { publish, CHANNELS } from "@wms/pubsub";
import type { CreateTaskInput, TaskCreatedPayload } from "@wms/types";

// Priority map: BullMQ uses lower number = higher priority
const PRIORITY_MAP = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
} as const;

export const taskService = {
  /**
   * Create a task → persist to DB → enqueue to BullMQ → publish event
   */
  async create(input: CreateTaskInput) {
    const correlationId = randomUUID();

    // 1. Persist to database
    const task = await taskRepository.create({
      name: input.name,
      priority: input.priority,
      payload: (input.payload as any) ?? undefined,
    });

    // 2. Enqueue for background processing
    await enqueueTask(
      task.id,
      {
        name: task.name,
        payload: task.payload,
      },
      {
        priority: PRIORITY_MAP[input.priority],
      },
    );

    // 3. Publish event (real-time notification)
    await publish<TaskCreatedPayload>(
      CHANNELS.TASKS,
      "task:created",
      {
        taskId: task.id,
        name: task.name,
        priority: task.priority,
      },
      correlationId,
    );

    // 4. Store event for audit trail
    await eventRepository.create({
      type: "task:created",
      payload: { taskId: task.id, name: task.name },
      correlationId,
    });

    return { task, correlationId };
  },

  async getById(id: string) {
    return taskRepository.findById(id);
  },

  async list(status?: string) {
    return taskRepository.findMany(status ? { status } : undefined);
  },

  async getEvents(correlationId: string) {
    return eventRepository.findByCorrelationId(correlationId);
  },
};
