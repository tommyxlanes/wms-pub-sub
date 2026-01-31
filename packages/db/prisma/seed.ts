import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(currentDir, "../../../.env") });
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const products = [
  {
    sku: "WH-001",
    name: "Wireless Headphones",
    description: "Noise-cancelling over-ear headphones",
    price: 79.99,
    quantity: 150,
    location: "A-1-01",
  },
  {
    sku: "KB-002",
    name: "Mechanical Keyboard",
    description: "RGB mechanical keyboard with Cherry MX switches",
    price: 129.99,
    quantity: 85,
    location: "A-1-02",
  },
  {
    sku: "MS-003",
    name: "Ergonomic Mouse",
    description: "Vertical ergonomic wireless mouse",
    price: 49.99,
    quantity: 200,
    location: "A-2-01",
  },
  {
    sku: "MN-004",
    name: '27" 4K Monitor',
    description: "IPS panel, 144Hz refresh rate",
    price: 449.99,
    quantity: 30,
    location: "B-1-01",
  },
  {
    sku: "WC-005",
    name: "HD Webcam",
    description: "1080p webcam with built-in microphone",
    price: 59.99,
    quantity: 120,
    location: "A-2-02",
  },
  {
    sku: "DS-006",
    name: "Docking Station",
    description: "USB-C docking station with dual HDMI",
    price: 189.99,
    quantity: 45,
    location: "B-1-02",
  },
  {
    sku: "CH-007",
    name: "USB-C Cable Pack",
    description: "3-pack braided USB-C cables (3ft, 6ft, 10ft)",
    price: 19.99,
    quantity: 500,
    location: "C-1-01",
  },
  {
    sku: "LP-008",
    name: "Laptop Stand",
    description: "Adjustable aluminum laptop stand",
    price: 39.99,
    quantity: 90,
    location: "B-2-01",
  },
  {
    sku: "MP-009",
    name: "Desk Mat XL",
    description: "Extended mouse pad 900x400mm",
    price: 24.99,
    quantity: 175,
    location: "C-1-02",
  },
  {
    sku: "PB-010",
    name: "Power Bank 20000mAh",
    description: "Fast-charging portable power bank",
    price: 34.99,
    quantity: 250,
    location: "C-2-01",
  },
];

async function main() {
  console.log("🌱 Seeding products...\n");

  for (const product of products) {
    const created = await prisma.product.upsert({
      where: { sku: product.sku },
      update: product,
      create: product,
    });
    console.log(
      `  ✅ ${created.sku} — ${created.name} (qty: ${created.quantity}, loc: ${created.location})`,
    );
  }

  console.log(`\n🎉 Seeded ${products.length} products`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
