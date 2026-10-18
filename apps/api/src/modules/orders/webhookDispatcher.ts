import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import { Prisma, type Reseller } from "@prisma/client";
import { env, isProd } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { decryptSecret, hmacHex } from "../../lib/crypto";
import { assertSafeWebhookUrl } from "../../lib/ssrf";
import { publicOrder } from "./orders.service";

/**
 * POST a signed JSON event to the reseller.
 *   X-Webhook-Timestamp: unix seconds
 *   X-Webhook-Signature: hex HMAC-SHA256(webhookSecret, `${timestamp}.${rawBody}`)
 */
export async function sendSignedWebhook(
  reseller: Reseller,
  url: string,
  payload: Record<string, unknown>,
  meta: { orderId?: string; event: string; attempt: number },
) {
  const body = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = hmacHex(decryptSecret(reseller.webhookSecretEnc, env.SECRETS_KEY), `${ts}.${body}`);

  let statusCode: number | undefined;
  let error: string | undefined;
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "manual", // never follow redirects (SSRF)
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TopUpHub-Webhook/1.0",
        "X-Webhook-Event": meta.event,
        "X-Webhook-Timestamp": ts,
        "X-Webhook-Signature": sig,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    statusCode = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (e) {
    error = String(e);
  }
  await prisma.webhookLog.create({
    data: {
      resellerId: reseller.id, orderId: meta.orderId, direction: "out_reseller", event: meta.event, url,
      payload: payload as Prisma.InputJsonValue, statusCode, success: !error, attempt: meta.attempt, error,
    },
  });
  if (error) throw new Error(error); // BullMQ retries with backoff
}

export async function deliverWebhookJob(job: Job<{ orderId: string; event: string }>) {
  const { orderId, event } = job.data;
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { product: true, reseller: true } });
  if (!order?.reseller?.webhookUrl) return;
  let url: URL;
  try {
    url = await assertSafeWebhookUrl(order.reseller.webhookUrl, !isProd);
  } catch (e) {
    throw new UnrecoverableError(`Unsafe webhook URL: ${String(e)}`); // retrying cannot fix this
  }
  await sendSignedWebhook(
    order.reseller,
    url.toString(),
    { event, created_at: new Date().toISOString(), data: publicOrder(order) },
    { orderId, event, attempt: job.attemptsMade + 1 },
  );
}
