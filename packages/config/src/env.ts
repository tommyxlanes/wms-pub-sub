import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(currentDir, "../../../.env") });

export const env = {
  // Database
  DATABASE_URL: process.env.DATABASE_URL!,

  // Redis
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",

  // API
  PORT: parseInt(process.env.PORT || "3000", 10),
  HOST: process.env.HOST || "0.0.0.0",
  NODE_ENV: process.env.NODE_ENV || "development",

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret",

  // Helpers
  isDev: process.env.NODE_ENV === "development",
  isProd: process.env.NODE_ENV === "production",
} as const;
