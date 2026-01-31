import { randomUUID } from "node:crypto";
import {
  orderRepository,
  productRepository,
  pickListRepository,
  packingRepository,
  shippingRepository,
} from "@wms/db";
import { publish, CHANNELS } from "@wms/pubsub";

const CARRIERS = [
  { carrier: "usps", service: "priority", rate: 8.95, days: 3 },
  { carrier: "ups", service: "ground", rate: 12.5, days: 5 },
  { carrier: "fedex", service: "express", rate: 24.99, days: 2 },
  { carrier: "usps", service: "ground", rate: 5.99, days: 7 },
  { carrier: "ups", service: "express", rate: 29.99, days: 1 },
];

export const fulfillmentService = {
  // ─── Generate Pick List ───
  async generatePickList(orderId: string) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status !== "pending" && order.status !== "processing") {
      throw new Error(
        `Cannot generate pick list for order in status: ${order.status}`,
      );
    }

    await orderRepository.updateStatus(orderId, "processing", {
      processedAt: new Date(),
    });

    const pickItems = order.lines.map((l: any) => ({
      productId: l.productId,
      sku: l.product.sku,
      name: l.product.name,
      quantity: l.quantity,
      location: l.product.location || "UNKNOWN",
      picked: false,
    }));

    const pickList = await pickListRepository.create({
      orderId,
      items: pickItems,
    });
    await pickListRepository.updateStatus(pickList.id, "in_progress", {
      startedAt: new Date(),
    });

    const cid = randomUUID();
    await publish(
      CHANNELS.TASKS,
      "order:processing" as any,
      {
        orderId,
        orderNumber: order.orderNumber,
        status: "processing",
        previousStatus: "pending",
        message: "Pick list generated",
      },
      cid,
    );

    await publish(
      CHANNELS.TASKS,
      "picklist:generated" as any,
      {
        pickListId: pickList.id,
        orderId,
        orderNumber: order.orderNumber,
        itemCount: pickItems.length,
        items: pickItems.map((i: any) => ({
          sku: i.sku,
          name: i.name,
          quantity: i.quantity,
          location: i.location,
        })),
      },
      cid,
    );

    return { pickList, order };
  },

  // ─── Pick a Single Item ───
  async pickItem(orderId: string, sku: string) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new Error("Order not found");

    const pickList = await findPickList(orderId);
    const items = pickList.items as any[];
    const item = items.find((i: any) => i.sku === sku && !i.picked);
    if (!item) throw new Error(`Item ${sku} not found or already picked`);

    item.picked = true;
    const pickedCount = items.filter((i: any) => i.picked).length;

    await pickListRepository.updateStatus(pickList.id, "in_progress", {
      items,
    });

    await publish(CHANNELS.TASKS, "picklist:item_picked" as any, {
      pickListId: pickList.id,
      orderNumber: order.orderNumber,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      location: item.location,
      progress: `${pickedCount} of ${items.length}`,
    });

    // Auto-complete picking if all items picked
    if (pickedCount === items.length) {
      await pickListRepository.updateStatus(pickList.id, "completed", {
        completedAt: new Date(),
        items,
      });

      await publish(CHANNELS.TASKS, "picklist:completed" as any, {
        pickListId: pickList.id,
        orderNumber: order.orderNumber,
        message: `All ${items.length} items picked`,
      });

      await orderRepository.updateStatus(orderId, "picked");
      await publish(CHANNELS.TASKS, "order:picked" as any, {
        orderId,
        orderNumber: order.orderNumber,
        status: "picked",
        previousStatus: "processing",
        message: "All items picked, ready for packing",
      });
    }

    return {
      pickedCount,
      totalCount: items.length,
      allPicked: pickedCount === items.length,
    };
  },

  // ─── Start Packing ───
  async startPacking(orderId: string) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status !== "picked")
      throw new Error(`Order must be picked first (current: ${order.status})`);

    const pickList = await findPickList(orderId);
    const packItems = (pickList.items as any[]).map((i: any) => ({
      productId: i.productId,
      sku: i.sku,
      name: i.name,
      quantity: i.quantity,
      verified: false,
    }));

    const packingTask = await packingRepository.create({
      orderId,
      items: packItems,
    });
    await packingRepository.updateStatus(packingTask.id, "in_progress");

    await publish(CHANNELS.TASKS, "packing:started" as any, {
      packingTaskId: packingTask.id,
      orderNumber: order.orderNumber,
      status: "in_progress",
    });

    return { packingTask };
  },

  // ─── Verify a Pack Item ───
  async verifyItem(orderId: string, sku: string) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new Error("Order not found");

    const packingTask = await findPackingTask(orderId);
    const items = packingTask.items as any[];
    const item = items.find((i: any) => i.sku === sku && !i.verified);
    if (!item) throw new Error(`Item ${sku} not found or already verified`);

    item.verified = true;
    const verifiedCount = items.filter((i: any) => i.verified).length;

    await packingRepository.updateStatus(packingTask.id, "in_progress", {
      items,
    });

    await publish(CHANNELS.TASKS, "packing:item_verified" as any, {
      packingTaskId: packingTask.id,
      orderNumber: order.orderNumber,
      sku: item.sku,
      name: item.name,
      progress: `${verifiedCount} of ${items.length} verified`,
    });

    return {
      verifiedCount,
      totalCount: items.length,
      allVerified: verifiedCount === items.length,
    };
  },

  // ─── Complete Packing ───
  async completePacking(
    orderId: string,
    weight: number,
    dimensions: { length: number; width: number; height: number },
  ) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new Error("Order not found");

    const packingTask = await findPackingTask(orderId);

    await packingRepository.updateStatus(packingTask.id, "completed", {
      completedAt: new Date(),
      weight,
      dimensions,
    });

    await publish(CHANNELS.TASKS, "packing:completed" as any, {
      packingTaskId: packingTask.id,
      orderNumber: order.orderNumber,
      status: "completed",
      weight,
      dimensions,
    });

    await orderRepository.updateStatus(orderId, "packed");
    await publish(CHANNELS.TASKS, "order:packed" as any, {
      orderId,
      orderNumber: order.orderNumber,
      status: "packed",
      previousStatus: "picked",
      message: `Packed — ${weight}lbs (${dimensions.length}x${dimensions.width}x${dimensions.height}in)`,
    });

    return { weight, dimensions };
  },

  // ─── Create Shipping Label ───
  async createLabel(orderId: string, carrierIdx?: number) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status !== "packed")
      throw new Error(`Order must be packed first (current: ${order.status})`);

    const selected =
      CARRIERS[carrierIdx ?? Math.floor(Math.random() * CARRIERS.length)];
    const trackingNumber = `${selected.carrier.toUpperCase()}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const label = await shippingRepository.create({
      orderId,
      carrier: selected.carrier,
      service: selected.service,
      trackingNumber,
      rate: selected.rate,
      estimatedDays: selected.days,
      labelUrl: `https://labels.example.com/${trackingNumber}.pdf`,
    });

    await publish(CHANNELS.TASKS, "shipping:label_created" as any, {
      labelId: label.id,
      orderId,
      orderNumber: order.orderNumber,
      carrier: selected.carrier,
      service: selected.service,
      trackingNumber,
      rate: selected.rate,
      estimatedDays: selected.days,
    });

    return { label, carrier: selected };
  },

  // ─── Ship Order ───
  async shipOrder(orderId: string) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new Error("Order not found");

    await orderRepository.updateStatus(orderId, "shipped", {
      shippedAt: new Date(),
    });

    for (const line of order.lines) {
      await productRepository.releaseReserved(line.productId, line.quantity);
    }

    await publish(CHANNELS.TASKS, "order:shipped" as any, {
      orderId,
      orderNumber: order.orderNumber,
      status: "shipped",
      previousStatus: "packed",
      message: "Order shipped!",
    });

    // Auto-complete
    await orderRepository.updateStatus(orderId, "completed");
    await publish(CHANNELS.TASKS, "order:completed" as any, {
      orderId,
      orderNumber: order.orderNumber,
      status: "completed",
      previousStatus: "shipped",
      message: "Order fulfilled successfully",
    });

    return { success: true };
  },
};

// ─── Helpers ───
async function findPickList(orderId: string) {
  const { prisma } = await import("@wms/db");
  const pickList = await prisma.pickList.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
  if (!pickList) throw new Error("No pick list found for this order");
  return pickList;
}

async function findPackingTask(orderId: string) {
  const { prisma } = await import("@wms/db");
  const task = await prisma.packingTask.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
  if (!task) throw new Error("No packing task found for this order");
  return task;
}
