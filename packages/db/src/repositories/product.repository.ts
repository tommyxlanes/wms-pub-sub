import { prisma } from "../client.js";

export const productRepository = {
  findAll() {
    return prisma.product.findMany({
      orderBy: { sku: "asc" },
    });
  },

  findById(id: string) {
    return prisma.product.findUnique({ where: { id } });
  },

  findBySku(sku: string) {
    return prisma.product.findUnique({ where: { sku } });
  },

  findInStock() {
    return prisma.product.findMany({
      where: { quantity: { gt: 0 } },
      orderBy: { sku: "asc" },
    });
  },

  decrementStock(id: string, quantity: number) {
    return prisma.product.update({
      where: { id },
      data: {
        quantity: { decrement: quantity },
        reserved: { increment: quantity },
      },
    });
  },

  releaseReserved(id: string, quantity: number) {
    return prisma.product.update({
      where: { id },
      data: {
        reserved: { decrement: quantity },
      },
    });
  },
};
