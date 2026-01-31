import { prisma } from "../client.js";
import type { Prisma } from "@prisma/client";

export const eventRepository = {
  create(data: Prisma.EventCreateInput) {
    return prisma.event.create({ data });
  },

  async findRecent(limit = 100) {
    return prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  findByCorrelationId(correlationId: string) {
    return prisma.event.findMany({
      where: { correlationId },
      orderBy: { createdAt: "asc" },
    });
  },

  findUnprocessed(type?: string) {
    return prisma.event.findMany({
      where: { processed: false, ...(type ? { type } : {}) },
      orderBy: { createdAt: "asc" },
    });
  },

  markProcessed(id: string) {
    return prisma.event.update({
      where: { id },
      data: { processed: true, processedAt: new Date() },
    });
  },
};
