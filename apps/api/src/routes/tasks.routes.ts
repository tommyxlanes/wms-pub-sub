import type { FastifyInstance } from "fastify";
import { CreateTaskSchema } from "@wms/types";
import { taskService } from "@wms/domain";
import { createTaskAction } from "../actions/createTask.action.js";

export async function taskRoutes(app: FastifyInstance) {
  // POST /api/tasks — Create and enqueue a task
  app.post("/", async (request, reply) => {
    const parsed = CreateTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: "Validation failed",
        data: parsed.error.flatten(),
      });
    }

    const result = await createTaskAction(parsed.data);
    return reply.status(201).send(result);
  });

  // GET /api/tasks — List all tasks
  app.get("/", async (request, reply) => {
    const { status } = request.query as { status?: string };
    const tasks = await taskService.list(status);
    return reply.send({ success: true, data: tasks });
  });

  // GET /api/tasks/:id — Get task by ID
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await taskService.getById(id);

    if (!task) {
      return reply.status(404).send({
        success: false,
        error: "Task not found",
      });
    }

    return reply.send({ success: true, data: task });
  });

  // GET /api/tasks/:id/events — Get events for a task's correlation ID
  app.get("/:id/events", async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await taskService.getById(id);

    if (!task) {
      return reply.status(404).send({
        success: false,
        error: "Task not found",
      });
    }

    // Get events from the task creation's correlation ID
    // In a real app you'd store correlationId on the task
    return reply.send({ success: true, data: [] });
  });
}
