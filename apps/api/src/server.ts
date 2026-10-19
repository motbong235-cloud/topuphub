import { env } from "./config/env";
import { createApp } from "./app";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { redis } from "./lib/redis";
import { startWorkers } from "./modules/orders/worker";
import { ensureCatalogSeeded } from "./modules/catalog/syncKhmerTopup";
import { ensureAdmin } from "./modules/auth/ensureAdmin";

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info("TopUpHub API listening", {
    port: env.PORT, provider: env.TOPUP_PROVIDER_RESOLVED, payway: env.PAYWAY_ENV, simulation: env.PAYMENT_SIMULATION,
  });
});

const stopWorkers = env.START_WORKER ? startWorkers() : null;
void ensureAdmin().then(() => ensureCatalogSeeded());

async function shutdown(signal: string) {
  logger.info("shutting down", { signal });
  server.close();
  if (stopWorkers) await stopWorkers();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
