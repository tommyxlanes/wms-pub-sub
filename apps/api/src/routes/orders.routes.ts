import type { FastifyInstance } from "fastify";
import { orderService } from "@wms/domain";

// Random customer names for simulation
const CUSTOMERS = [
  "Alice Johnson", "Bob Smith", "Carlos Rivera", "Diana Chen",
  "Erik Larsson", "Fatima Al-Rashid", "Greg Tanaka", "Hannah Kim",
  "Ivan Petrov", "Julia Santos",
];

export async function orderRoutes(app: FastifyInstance) {
  // GET /api/orders — List all orders
  app.get("/", async (request, reply) => {
    const { status } = request.query as { status?: string };
    const orders = await orderService.list(status);
    return reply.send({ success: true, data: orders });
  });

  // GET /api/orders/stats — Dashboard stats
  app.get("/stats", async (request, reply) => {
    const stats = await orderService.getStats();
    return reply.send({ success: true, data: stats });
  });

  // GET /api/orders/:id — Get order by ID
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const order = await orderService.getById(id);
    if (!order) {
      return reply.status(404).send({ success: false, error: "Order not found" });
    }
    return reply.send({ success: true, data: order });
  });

  // GET /api/orders/products — List all products
  app.get("/products", async (request, reply) => {
    const products = await orderService.getProducts();
    return reply.send({ success: true, data: products });
  });

  // POST /api/orders — Create a single order
  app.post("/", async (request, reply) => {
    try {
      const body = request.body as {
        customerName: string;
        customerEmail?: string;
        priority?: string;
        items: { productId: string; quantity: number }[];
      };

      const result = await orderService.create(body);
      return reply.status(201).send({
        success: true,
        data: result.order,
        meta: { correlationId: result.correlationId },
      });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // ─── Simulation Endpoints ───────────────────────────────────

  // POST /api/orders/simulate — Generate a random order
  app.post("/simulate", async (request, reply) => {
    try {
      const products = await orderService.getProducts();
      const inStock = products.filter((p) => p.quantity > 5);

      if (inStock.length === 0) {
        return reply.status(400).send({ success: false, error: "No products in stock" });
      }

      // Pick 1-3 random products
      const itemCount = Math.min(
        Math.floor(Math.random() * 3) + 1,
        inStock.length
      );
      const shuffled = inStock.sort(() => Math.random() - 0.5);
      const items = shuffled.slice(0, itemCount).map((p) => ({
        productId: p.id,
        quantity: Math.floor(Math.random() * 3) + 1,
      }));

      const customer = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
      const priorities = ["low", "normal", "normal", "high", "critical"];
      const priority = priorities[Math.floor(Math.random() * priorities.length)];

      const result = await orderService.create({
        customerName: customer,
        customerEmail: `${customer.toLowerCase().replace(" ", ".")}@example.com`,
        priority,
        items,
      });

      return reply.status(201).send({
        success: true,
        data: result.order,
        meta: { correlationId: result.correlationId },
      });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // POST /api/orders/simulate/burst — Generate multiple random orders
  app.post("/simulate/burst", async (request, reply) => {
    const { count = 5 } = request.query as { count?: number };
    const results = [];
    const errors = [];

    for (let i = 0; i < Math.min(count, 10); i++) {
      try {
        const products = await orderService.getProducts();
        const inStock = products.filter((p) => p.quantity > 5);
        if (inStock.length === 0) break;

        const itemCount = Math.min(
          Math.floor(Math.random() * 3) + 1,
          inStock.length
        );
        const shuffled = inStock.sort(() => Math.random() - 0.5);
        const items = shuffled.slice(0, itemCount).map((p) => ({
          productId: p.id,
          quantity: Math.floor(Math.random() * 2) + 1,
        }));

        const customer = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
        const priority = ["low", "normal", "high"][Math.floor(Math.random() * 3)];

        const result = await orderService.create({
          customerName: customer,
          priority,
          items,
        });
        results.push(result.order.orderNumber);
      } catch (err: any) {
        errors.push(err.message);
      }
    }

    return reply.send({
      success: true,
      data: { created: results.length, orders: results, errors },
    });
  });
}
