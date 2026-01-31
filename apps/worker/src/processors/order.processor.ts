import {
  orderRepository,
  productRepository,
  pickListRepository,
  packingRepository,
  shippingRepository,
} from "@wms/db";
import { publish, CHANNELS } from "@wms/pubsub";
import type { Job } from "@wms/queue";

interface OrderJobData {
  taskId: string;
  name: string;
  type: string;
  orderId: string;
  orderNumber: string;
}

const CARRIERS = [
  { carrier: "usps", service: "priority", rate: 8.95, days: 3 },
  { carrier: "ups", service: "ground", rate: 12.5, days: 5 },
  { carrier: "fedex", service: "express", rate: 24.99, days: 2 },
  { carrier: "usps", service: "ground", rate: 5.99, days: 7 },
  { carrier: "ups", service: "express", rate: 29.99, days: 1 },
];

export async function processOrderFulfillment(job: Job<OrderJobData>) {
  const { orderId, orderNumber } = job.data;
  console.log(`\n🛒 Processing order: ${orderNumber}`);

  const order = await orderRepository.findById(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  // ═══ STEP 1: Processing ═══
  await orderRepository.updateStatus(orderId, "processing", {
    processedAt: new Date(),
  });
  await publish(CHANNELS.TASKS, "order:processing" as any, {
    orderId,
    orderNumber,
    status: "processing",
    previousStatus: "pending",
    message: "Order received, generating pick list",
  });
  await job.updateProgress(10);
  await delay(800);

  // ═══ STEP 2: Generate Pick List ═══
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

  await publish(CHANNELS.TASKS, "picklist:generated" as any, {
    pickListId: pickList.id,
    orderId,
    orderNumber,
    itemCount: pickItems.length,
    items: pickItems.map((i: any) => ({
      sku: i.sku,
      name: i.name,
      quantity: i.quantity,
      location: i.location,
    })),
  });
  console.log(`  📋 Pick list generated: ${pickItems.length} items`);
  await job.updateProgress(20);
  await delay(1000);

  // ═══ STEP 3: Pick Each Item ═══
  await pickListRepository.updateStatus(pickList.id, "in_progress", {
    startedAt: new Date(),
  });
  await orderRepository.updateStatus(orderId, "picking" as any);

  for (let i = 0; i < pickItems.length; i++) {
    const item = pickItems[i];
    await delay(1200); // Simulate walking to location + scanning

    item.picked = true;

    await publish(CHANNELS.TASKS, "picklist:item_picked" as any, {
      pickListId: pickList.id,
      orderNumber,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      location: item.location,
      progress: `${i + 1} of ${pickItems.length}`,
    });

    console.log(
      `  📦 Picked: ${item.sku} (${item.quantity}x) from ${item.location} — ${i + 1}/${pickItems.length}`,
    );
    const pickProgress = 20 + ((i + 1) / pickItems.length) * 25;
    await job.updateProgress(Math.round(pickProgress));
  }

  await pickListRepository.updateStatus(pickList.id, "completed", {
    completedAt: new Date(),
    items: pickItems,
  });

  await publish(CHANNELS.TASKS, "picklist:completed" as any, {
    pickListId: pickList.id,
    orderNumber,
    message: `All ${pickItems.length} items picked`,
  });

  await orderRepository.updateStatus(orderId, "picked");
  await publish(CHANNELS.TASKS, "order:picked" as any, {
    orderId,
    orderNumber,
    status: "picked",
    previousStatus: "picking",
    message: `${pickItems.length} item(s) picked and ready for packing`,
  });
  await job.updateProgress(50);
  await delay(600);

  // ═══ STEP 4: Packing ═══
  const packItems = pickItems.map((i: any) => ({
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
    orderNumber,
    status: "in_progress",
  });
  console.log(`  📦 Packing started`);
  await delay(800);

  // Verify each item during packing
  for (let i = 0; i < packItems.length; i++) {
    await delay(800);
    packItems[i].verified = true;

    await publish(CHANNELS.TASKS, "packing:item_verified" as any, {
      packingTaskId: packingTask.id,
      orderNumber,
      sku: packItems[i].sku,
      name: packItems[i].name,
      progress: `${i + 1} of ${packItems.length} verified`,
    });

    console.log(`  ✅ Verified: ${packItems[i].sku}`);
    const packProgress = 50 + ((i + 1) / packItems.length) * 20;
    await job.updateProgress(Math.round(packProgress));
  }

  const weight = +(Math.random() * 10 + 1).toFixed(2);
  const dimensions = {
    length: Math.round(Math.random() * 20 + 6),
    width: Math.round(Math.random() * 15 + 4),
    height: Math.round(Math.random() * 10 + 2),
  };

  await packingRepository.updateStatus(packingTask.id, "completed", {
    completedAt: new Date(),
    items: packItems,
    weight,
    dimensions,
  });

  await publish(CHANNELS.TASKS, "packing:completed" as any, {
    packingTaskId: packingTask.id,
    orderNumber,
    status: "completed",
    weight,
    dimensions,
  });

  await orderRepository.updateStatus(orderId, "packed");
  await publish(CHANNELS.TASKS, "order:packed" as any, {
    orderId,
    orderNumber,
    status: "packed",
    previousStatus: "picked",
    message: `Packed — ${weight}lbs (${dimensions.length}x${dimensions.width}x${dimensions.height}in)`,
  });
  await job.updateProgress(75);
  await delay(500);

  // ═══ STEP 5: Create Shipping Label ═══
  const selectedCarrier = CARRIERS[Math.floor(Math.random() * CARRIERS.length)];
  const trackingNumber = `${selectedCarrier.carrier.toUpperCase()}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const label = await shippingRepository.create({
    orderId,
    carrier: selectedCarrier.carrier,
    service: selectedCarrier.service,
    trackingNumber,
    rate: selectedCarrier.rate,
    estimatedDays: selectedCarrier.days,
    labelUrl: `https://labels.example.com/${trackingNumber}.pdf`,
  });

  await publish(CHANNELS.TASKS, "shipping:label_created" as any, {
    labelId: label.id,
    orderId,
    orderNumber,
    carrier: selectedCarrier.carrier,
    service: selectedCarrier.service,
    trackingNumber,
    rate: selectedCarrier.rate,
    estimatedDays: selectedCarrier.days,
  });

  console.log(
    `  🏷️  Label: ${selectedCarrier.carrier.toUpperCase()} ${selectedCarrier.service} — ${trackingNumber} ($${selectedCarrier.rate})`,
  );
  await job.updateProgress(90);
  await delay(600);

  // ═══ STEP 6: Ship ═══
  await orderRepository.updateStatus(orderId, "shipped", {
    shippedAt: new Date(),
  });
  await publish(CHANNELS.TASKS, "order:shipped" as any, {
    orderId,
    orderNumber,
    status: "shipped",
    previousStatus: "packed",
    message: `Shipped via ${selectedCarrier.carrier.toUpperCase()} ${selectedCarrier.service} — ${trackingNumber}`,
  });
  await delay(400);

  // ═══ STEP 7: Release inventory + complete ═══
  for (const line of order.lines) {
    await productRepository.releaseReserved(line.productId, line.quantity);
  }

  await orderRepository.updateStatus(orderId, "completed");
  await publish(CHANNELS.TASKS, "order:completed" as any, {
    orderId,
    orderNumber,
    status: "completed",
    previousStatus: "shipped",
    message: "Order fulfilled successfully",
  });
  await job.updateProgress(100);

  console.log(`  🎉 ${orderNumber} completed!\n`);
  return { orderNumber, trackingNumber, carrier: selectedCarrier.carrier };
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
