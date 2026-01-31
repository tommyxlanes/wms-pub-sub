import { randomUUID } from "node:crypto";
import { orderRepository, productRepository } from "@wms/db";
import { enqueueTask } from "@wms/queue";
import { publish, CHANNELS } from "@wms/pubsub";
import type {
  OrderCreatedPayload,
  OrderStatusPayload,
  InventoryUpdatePayload,
} from "@wms/types";

// Generate order number like WMS-20260131-001
let orderCounter = 0;
function generateOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${date}-${rand}`;
}

export const orderService = {
  async create(input: {
    customerName: string;
    customerEmail?: string;
    priority?: string;
    items: { productId: string; quantity: number }[];
  }) {
    const correlationId = randomUUID();

    // 1. Fetch products and calculate total
    const lineData = [];
    let totalAmount = 0;

    for (const item of input.items) {
      const product = await productRepository.findById(item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);
      if (product.quantity < item.quantity) {
        throw new Error(
          `Insufficient stock for ${product.name}: ${product.quantity} available, ${item.quantity} requested`,
        );
      }

      lineData.push({
        productId: item.productId,
        quantity: item.quantity,
        price: product.price,
      });
      totalAmount += product.price * item.quantity;
    }

    // 2. Create order with lines
    const order = await orderRepository.create({
      orderNumber: generateOrderNumber(),
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      priority: input.priority || "normal",
      totalAmount: Math.round(totalAmount * 100) / 100,
      lines: {
        create: lineData,
      },
    });

    // 3. Reserve inventory
    for (const item of input.items) {
      const product = await productRepository.findById(item.productId);
      await productRepository.decrementStock(item.productId, item.quantity);

      await publish<InventoryUpdatePayload>(
        CHANNELS.TASKS,
        "inventory:updated",
        {
          productId: item.productId,
          sku: product!.sku,
          name: product!.name,
          previousQty: product!.quantity,
          newQty: product!.quantity - item.quantity,
          reserved: product!.reserved + item.quantity,
        },
        correlationId,
      );
    }

    // 4. Publish order created event
    await publish<OrderCreatedPayload>(
      CHANNELS.TASKS,
      "order:created",
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        totalAmount: order.totalAmount,
        itemCount: order.lines.length,
        priority: order.priority,
      },
      correlationId,
    );

    // 5. Enqueue order for fulfillment processing
    await enqueueTask(order.id, {
      name: `fulfill-order:${order.orderNumber}`,
      type: "order-fulfillment",
      orderId: order.id,
      orderNumber: order.orderNumber,
    });

    return { order, correlationId };
  },

  async getById(id: string) {
    return orderRepository.findById(id);
  },

  async list(status?: string) {
    return orderRepository.findMany(status);
  },

  async getProducts() {
    return productRepository.findAll();
  },

  async getStats() {
    const statusCounts = await orderRepository.countByStatus();
    const products = await productRepository.findAll();

    return {
      orders: statusCounts,
      totalProducts: products.length,
      lowStock: products.filter((p) => p.quantity < 20).length,
      totalInventory: products.reduce((sum, p) => sum + p.quantity, 0),
    };
  },
};
