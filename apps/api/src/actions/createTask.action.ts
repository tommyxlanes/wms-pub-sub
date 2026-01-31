import { taskService } from "@wms/domain";
import type { CreateTaskInput, ApiResponse } from "@wms/types";

export async function createTaskAction(
  input: CreateTaskInput
): Promise<ApiResponse> {
  const { task, correlationId } = await taskService.create(input);

  return {
    success: true,
    data: {
      id: task.id,
      name: task.name,
      status: task.status,
      priority: task.priority,
    },
    meta: {
      timestamp: new Date().toISOString(),
      correlationId,
    },
  };
}
