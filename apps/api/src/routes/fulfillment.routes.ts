import type { FastifyInstance } from "fastify";
import { fulfillmentService } from "@wms/domain";

export async function fulfillmentRoutes(app: FastifyInstance) {
  // Generate pick list
  app.post("/:id/picklist", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const result = await fulfillmentService.generatePickList(id);
      return reply.send({ success: true, data: result });
    } catch (e: any) {
      return reply.status(400).send({ success: false, error: e.message });
    }
  });

  // Pick a single item
  app.post("/:id/pick", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const { sku } = req.body as { sku: string };
      const result = await fulfillmentService.pickItem(id, sku);
      return reply.send({ success: true, data: result });
    } catch (e: any) {
      return reply.status(400).send({ success: false, error: e.message });
    }
  });

  // Start packing
  app.post("/:id/pack/start", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const result = await fulfillmentService.startPacking(id);
      return reply.send({ success: true, data: result });
    } catch (e: any) {
      return reply.status(400).send({ success: false, error: e.message });
    }
  });

  // Verify a pack item
  app.post("/:id/pack/verify", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const { sku } = req.body as { sku: string };
      const result = await fulfillmentService.verifyItem(id, sku);
      return reply.send({ success: true, data: result });
    } catch (e: any) {
      return reply.status(400).send({ success: false, error: e.message });
    }
  });

  // Complete packing
  app.post("/:id/pack/complete", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const { weight, dimensions } = req.body as {
        weight: number;
        dimensions: { length: number; width: number; height: number };
      };
      const result = await fulfillmentService.completePacking(
        id,
        weight,
        dimensions,
      );
      return reply.send({ success: true, data: result });
    } catch (e: any) {
      return reply.status(400).send({ success: false, error: e.message });
    }
  });

  // Create shipping label
  app.post("/:id/label", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const { carrierIdx } = (req.body || {}) as { carrierIdx?: number };
      const result = await fulfillmentService.createLabel(id, carrierIdx);
      return reply.send({ success: true, data: result });
    } catch (e: any) {
      return reply.status(400).send({ success: false, error: e.message });
    }
  });

  // Ship order
  app.post("/:id/ship", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const result = await fulfillmentService.shipOrder(id);
      return reply.send({ success: true, data: result });
    } catch (e: any) {
      return reply.status(400).send({ success: false, error: e.message });
    }
  });
}
