import { Worker, UnrecoverableError, type Job } from "bullmq";
import { prisma } from "../../lib/prisma";
import { redis } from "../../lib/redis";
import { logger } from "../../lib/logger";
import { getProvider } from "../provider";
import {
  ProviderAmbiguousError, ProviderRejectedError, type ProviderStatus,
} from "../provider/types";
import { completeOrder, failOrder } from "./orders.service";
import { deliverWebhookJob } from "./webhookDispatcher";
import { ORDER_QUEUE, WEBHOOK_QUEUE, enqueuePoll, enqueueProcess } from "./queue";
import { reconcilePendingPayments } from "../payments/payments.service";

const MAX_POLLS = 30; // 30 x 10s = 5 minutes of waiting for the provider

export async function processOrderJob(job: Job<{ orderId: string; poll?: number }>) {
  const { orderId, poll = 0 } = job.data;
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { product: true } });
  if (!order) throw new UnrecoverableError("Order not found");
  if (!["PAID", "PROCESSING"].includes(order.status) || order.needsReview) return; // already handled

  await prisma.order.updateMany({ where: { id: orderId, status: "PAID" }, data: { status: "PROCESSING" } });
  const provider = getProvider();

  let status: ProviderStatus;
  if (order.providerRef) {
    status = (await provider.checkStatus(order.providerRef)).status; // never create a second provider order
  } else {
    try {
      const r = await provider.createOrder({
        productCode: order.product.providerCode,
        target: order.target,
        serverId: order.serverId ?? undefined,
        quantity: order.quantity,
        requestId: order.code,
      });
      await prisma.order.update({ where: { id: orderId }, data: { providerRef: r.providerRef } });
      status = r.status;
    } catch (e) {
      if (e instanceof ProviderAmbiguousError) {
        await prisma.order.update({
          where: { id: orderId },
          data: { needsReview: true, failReason: `Provider outcome unknown: ${e.message}`.slice(0, 300) },
        });
        logger.error("order needs manual review", { orderId, err: e.message });
        return; // no retry: avoids delivering twice
      }
      if (e instanceof ProviderRejectedError) throw new UnrecoverableError(e.message); // refund now
      throw e; // transient -> BullMQ retry with backoff
    }
  }

  if (status === "COMPLETED") {
    await completeOrder(orderId);
  } else if (status === "FAILED") {
    throw new UnrecoverableError("Provider reported the order as failed");
  } else if (poll < MAX_POLLS) {
    await enqueuePoll(orderId, poll + 1);
  } else {
    await prisma.order.update({ where: { id: orderId }, data: { needsReview: true, failReason: "Provider still pending after 5 minutes" } });
  }
}

/** Starts BullMQ workers + the safety-net sweeper. Call once per process. */
export function startWorkers() {
  const orders = new Worker(ORDER_QUEUE, processOrderJob, { connection: redis, concurrency: 5 });
  orders.on("failed", async (job, err) => {
    if (!job) return;
    const finalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (err instanceof UnrecoverableError || finalAttempt) {
      logger.warn("order failed permanently, refunding", { orderId: job.data.orderId, err: err.message });
      await failOrder(job.data.orderId, err.message).catch((e) => logger.error("failOrder crashed", { err: String(e) }));
    }
  });
  orders.on("error", (e) => logger.error("order worker error", { err: String(e) }));

  const hooks = new Worker(WEBHOOK_QUEUE, deliverWebhookJob, { connection: redis, concurrency: 10 });
  hooks.on("error", (e) => logger.error("webhook worker error", { err: String(e) }));

  // Safety net every 60s: (1) PAID orders whose job was lost (Redis hiccup) and (2) payments whose pushback never arrived.
  const timer = setInterval(async () => {
    try {
      const stuck = await prisma.order.findMany({
        where: { status: "PAID", updatedAt: { lt: new Date(Date.now() - 30_000) } },
        select: { id: true }, take: 100,
      });
      for (const o of stuck) await enqueueProcess(o.id);
      await reconcilePendingPayments();
    } catch (e) {
      logger.error("sweeper failed", { err: String(e) });
    }
  }, 60_000);
  timer.unref();

  return async () => {
    clearInterval(timer);
    await Promise.all([orders.close(), hooks.close()]);
  };
}
