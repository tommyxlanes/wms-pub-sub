import { prisma } from "../client.js";
import type { Prisma } from "@prisma/client";

export const taskRepository = {
  create(data: Prisma.TaskCreateInput) {
    return prisma.task.create({ data });
  },

  findById(id: string) {
    return prisma.task.findUnique({ where: { id } });
  },

  findMany(where?: Prisma.TaskWhereInput) {
    return prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  },

  updateStatus(
    id: string,
    status: string,
    extra?: Partial<Prisma.TaskUpdateInput>
  ) {
    return prisma.task.update({
      where: { id },
      data: { status, ...extra },
    });
  },

  markStarted(id: string) {
    return prisma.task.update({
      where: { id },
      data: {
        status: "processing",
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  },

  markCompleted(id: string, result?: unknown) {
    return prisma.task.update({
      where: { id },
      data: {
        status: "completed",
        result: result as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
  },

  markFailed(id: string, error: string) {
    return prisma.task.update({
      where: { id },
      data: { status: "failed", error },
    });
  },
};
