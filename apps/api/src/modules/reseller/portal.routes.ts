import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { env, isProd } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/asyncHandler";
import { badRequest, forbidden } from "../../lib/errors";
import { encryptSecret, randomToken } from "../../lib/crypto";
import { assertSafeWebhookUrl } from "../../lib/ssrf";
import { requireAuth } from "../../middleware/auth";
import { publicOrder } from "../orders/orders.service";
import { sendSignedWebhook } from "../orders/webhookDispatcher";
import { createWalletTopup } from "../payments/payments.service";

/** Reseller dashboard (JWT, role RESELLER): API key, balance, webhook, logs. */
export const portalRouter = Router();
portalRouter.use(requireAuth("RESELLER", "ADMIN"));
portalRouter.use((req: Request, _res: Response, next: NextFunction) => {
  prisma.reseller.findUnique({ where: { userId: req.user!.id } })
    .then((r) => { if (!r) throw forbidden("No reseller account"); req.reseller = r; next(); })
    .catch(next);
});

portalRouter.get("/me", asyncHandler(async (req, res) => {
  const r = req.reseller!;
  res.json({
    api_key: r.apiKey, balance: r.balance.toFixed(2), currency: "USD", webhook_url: r.webhookUrl,
    rate_limit_per_min: r.rateLimitPerMin, active: r.active, created_at: r.createdAt.toISOString(),
    base_url: `${env.API_URL}/api/v1/reseller`,
  });
}));

portalRouter.put("/webhook", asyncHandler(async (req, res) => {
  const { url } = z.object({ url: z.string().max(300).nullable() }).parse(req.body);
  if (url) await assertSafeWebhookUrl(url, !isProd);
  await prisma.reseller.update({ where: { id: req.reseller!.id }, data: { webhookUrl: url || null } });
  res.json({ ok: true });
}));

/** New API secret is shown ONCE; only an encrypted copy is stored (needed to verify HMAC signatures). */
portalRouter.post("/rotate-secret", asyncHandler(async (req, res) => {
  const secret = `sk_${randomToken(24)}`;
  await prisma.reseller.update({ where: { id: req.reseller!.id }, data: { apiSecretEnc: encryptSecret(secret, env.SECRETS_KEY) } });
  res.json({ api_secret: secret });
}));

portalRouter.post("/rotate-webhook-secret", asyncHandler(async (req, res) => {
  const secret = `whsec_${randomToken(24)}`;
  await prisma.reseller.update({ where: { id: req.reseller!.id }, data: { webhookSecretEnc: encryptSecret(secret, env.SECRETS_KEY) } });
  res.json({ webhook_secret: secret });
}));

portalRouter.get("/api-logs", asyncHandler(async (req, res) => {
  const rows = await prisma.apiLog.findMany({ where: { resellerId: req.reseller!.id }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ logs: rows.map((l) => ({ id: l.id, method: l.method, path: l.path, status: l.statusCode, ip: l.ip, ms: l.durationMs, at: l.createdAt.toISOString() })) });
}));

portalRouter.get("/webhook-logs", asyncHandler(async (req, res) => {
  const rows = await prisma.webhookLog.findMany({ where: { resellerId: req.reseller!.id, direction: "out_reseller" }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ logs: rows.map((l) => ({ id: l.id, event: l.event, url: l.url, status: l.statusCode, success: l.success, attempt: l.attempt, error: l.error, at: l.createdAt.toISOString() })) });
}));

portalRouter.get("/orders", asyncHandler(async (req, res) => {
  const rows = await prisma.order.findMany({ where: { resellerId: req.reseller!.id }, include: { product: true }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ orders: rows.map(publicOrder) });
}));

portalRouter.get("/transactions", asyncHandler(async (req, res) => {
  const rows = await prisma.transaction.findMany({ where: { resellerId: req.reseller!.id }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ transactions: rows.map((t) => ({ id: t.id, type: t.type, status: t.status, amount: t.amount.toFixed(2), gateway: t.gateway, note: t.note, at: t.createdAt.toISOString() })) });
}));

portalRouter.post("/topup", asyncHandler(async (req, res) => {
  const { amount } = z.object({ amount: z.coerce.number() }).parse(req.body);
  res.status(201).json(await createWalletTopup(req.reseller!, amount));
}));

portalRouter.post("/webhook/test", asyncHandler(async (req, res) => {
  const r = await prisma.reseller.findUniqueOrThrow({ where: { id: req.reseller!.id } });
  if (!r.webhookUrl) throw badRequest("Set a webhook URL first", "NO_WEBHOOK_URL");
  const url = await assertSafeWebhookUrl(r.webhookUrl, !isProd);
  try {
    await sendSignedWebhook(r, url.toString(), { event: "webhook.test", created_at: new Date().toISOString(), data: { message: "TopUpHub test event" } }, { event: "webhook.test", attempt: 1 });
    res.json({ delivered: true });
  } catch (e) {
    res.status(502).json({ delivered: false, error: String((e as Error).message) });
  }
}));
