import { Queue } from "bullmq";
import { redis } from "../../lib/redis";

export const ORDER_QUEUE = "process-order";
export const WEBHOOK_QUEUE = "reseller-webhook";

/** process-order: 3 attempts, exponential backoff (5s, 10s, 20s). */
export const orderQueue = new Queue(ORDER_QUEUE, {
  connection: redis,
  defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 } },
});

/** reseller-webhook: 5 attempts, exponential backoff (10s, 20s, 40s, 80s). */
export const webhookQueue = new Queue(WEBHOOK_QUEUE, {
  connection: redis,
  defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 10_000 }, removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 } },
});

/** jobId = order id, so enqueuing the same paid order twice is a no-op. */
export const enqueueProcess = (orderId: string) =>
  orderQueue.add("process-order", { orderId }, { jobId: `order_${orderId}` });

/** Re-check provider status later (provider answered PENDING/PROCESSING). */
export const enqueuePoll = (orderId: string, poll: number) =>
  orderQueue.add("process-order", { orderId, poll }, { jobId: `order_${orderId}_p${poll}`, delay: 10_000 });

export const enqueueWebhook = (orderId: string, event: string) =>
  webhookQueue.add("deliver", { orderId, event }, { jobId: `wh_${orderId}_${event}_${Date.now()}` });
