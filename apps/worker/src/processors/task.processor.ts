import { taskRepository } from "@wms/db";
import { publish, CHANNELS } from "@wms/pubsub";
import type { Job } from "@wms/queue";
import type { TaskCompletedPayload, TaskFailedPayload, JobProgressPayload } from "@wms/types";

interface TaskJobData {
  taskId: string;
  name: string;
  payload?: Record<string, unknown>;
}

export async function processTask(job: Job<TaskJobData>) {
  const { taskId, name } = job.data;
  const startTime = Date.now();

  console.log(`🔧 Processing task: ${name} (${taskId})`);

  try {
    // 1. Mark as started in DB
    await taskRepository.markStarted(taskId);

    // 2. Publish "started" event
    await publish(CHANNELS.TASKS, "task:started", {
      taskId,
      name,
    });

    // 3. Simulate work with progress updates
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      // Simulate async work (replace with real logic)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const progress = Math.round((i / steps) * 100);
      await job.updateProgress(progress);

      // Publish progress event
      await publish<JobProgressPayload>(CHANNELS.TASKS, "job:progress", {
        jobId: job.id!,
        taskId,
        progress,
        message: `Step ${i}/${steps} complete`,
      });

      console.log(`  📊 ${name}: ${progress}%`);
    }

    // 4. Mark completed
    const duration = Date.now() - startTime;
    const result = { processedAt: new Date().toISOString(), duration };

    await taskRepository.markCompleted(taskId, result);

    // 5. Publish completed event
    await publish<TaskCompletedPayload>(CHANNELS.TASKS, "task:completed", {
      taskId,
      result,
      duration,
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Mark failed (only on final attempt)
    if (job.attemptsMade >= (job.opts.attempts ?? 3) - 1) {
      await taskRepository.markFailed(taskId, errorMessage);
    }

    // Publish failure event
    await publish<TaskFailedPayload>(CHANNELS.TASKS, "task:failed", {
      taskId,
      error: errorMessage,
      attempt: job.attemptsMade + 1,
    });

    throw error; // Re-throw so BullMQ handles retries
  }
}
