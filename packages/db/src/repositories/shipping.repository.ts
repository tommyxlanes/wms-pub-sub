import { prisma } from "../client.js";

export const shippingRepository = {
  create(data: {
    orderId: string;
    carrier: string;
    service: string;
    trackingNumber: string;
    rate: number;
    estimatedDays: number;
    labelUrl?: string;
  }) {
    return prisma.shippingLabel.create({ data });
  },
};
