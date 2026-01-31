import { prisma } from "../client.js";

export const pickListRepository = {
  create(data: { orderId: string; items: any }) {
    return prisma.pickList.create({
      data: { orderId: data.orderId, items: data.items },
    });
  },

  updateStatus(id: string, status: string, extra?: Record<string, any>) {
    return prisma.pickList.update({
      where: { id },
      data: { status, ...extra },
    });
  },
};
