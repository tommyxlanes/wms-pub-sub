import { prisma } from "../client.js";
import type { Prisma } from "@prisma/client";

export const orderRepository = {
  create(data: Prisma.OrderCreateInput) {
    return prisma.order.create({
      data,
      include: { lines: { include: { product: true } } },
    });
  },

  findById(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: { lines: { include: { product: true } } },
    });
  },

  findByOrderNumber(orderNumber: string) {
    return prisma.order.findUnique({
      where: { orderNumber },
      include: { lines: { include: { product: true } } },
    });
  },

  async findMany(status?: string) {
    return prisma.order.findMany({
      where: status ? { status } : undefined,
      include: {
        lines: { include: { product: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  updateStatus(
    id: string,
    status: string,
    extra?: Partial<Prisma.OrderUpdateInput>,
  ) {
    return prisma.order.update({
      where: { id },
      data: { status, ...extra },
      include: { lines: { include: { product: true } } },
    });
  },

  countByStatus() {
    return prisma.order.groupBy({
      by: ["status"],
      _count: true,
    });
  },
};
