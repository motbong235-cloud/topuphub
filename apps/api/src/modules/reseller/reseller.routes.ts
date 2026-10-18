import { Router } from "express";
import { z } from "zod";
import { env, isProd } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/asyncHandler";
import { badRequest, notFound } from "../../lib/errors";
import { assertSafeWebhookUrl } from "../../lib/ssrf";
import { requireIdempotencyKey, resellerAuth } from "../../middleware/resellerAuth";
import { createResellerOrder, publicOrder } from "../orders/orders.service";
import { sendSignedWebhook } from "../orders/webhookDispatcher";
import { createWalletTopup } from "../payments/payments.service";

/** Public reseller API: /api/v1/reseller/*  (HMAC authenticated) */
export const resellerApiRouter = Router();
resellerApiRouter.use(resellerAuth);

const orderSchema = z.object({
  product: z.string().min(1).max(100), // product slug or id
  target: z.string().trim().min(1).max(64),
  server_id: z.string().trim().max(32).optional(),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
  reference: z.string().trim().max(100).optional(),
});

resellerApiRouter.get("/products", asyncHandler(async (_req, res) => {
  const list = await prisma.product.findMany({ where: { active: true }, orderBy: [{ sort: "asc" }, { name: "asc" }] });
  res.json({
    products: list.map((p) => ({
      id: p.id, slug: p.slug, name: p.name, category: p.category, price: p.resellerPrice.toFixed(2),
      currency: p.currency, requires_server: p.requiresServer,
    })),
  });
}));

resellerApiRouter.get("/balance", asyncHandler(async (req, res) => {
  const r = await prisma.reseller.findUniqueOrThrow({ where: { id: req.reseller!.id } });
  res.json({ balance: r.balance.toFixed(2), currency: "USD" });
}));

resellerApiRouter.post("/orders", asyncHandler(async (req, res) => {
  const idem = requireIdempotencyKey(req);
  const b = orderSchema.parse(req.body);
  const { order, replay } = await createResellerOrder(
    req.reseller!, { product: b.product, target: b.target, serverId: b.server_id || undefined, quantity: b.quantity, reference: b.reference }, idem,
  );
  if (replay) res.setHeader("Idempotent-Replay", "true");
  res.status(replay ? 200 : 201).json({ order: publicOrder(order) });
}));

resellerApiRouter.get("/orders/:id", asyncHandler(async (req, res) => {
  const o = await prisma.order.findFirst({
    where: { resellerId: req.reseller!.id, OR: [{ id: req.params.id }, { code: req.params.id }, { resellerRef: req.params.id }] },
    include: { product: true },
  });
  if (!o) throw notFound("Order not found");
  res.json({ order: publicOrder(o) });
}));

resellerApiRouter.get("/orders", asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const rows = await prisma.order.findMany({ where: { resellerId: req.reseller!.id }, include: { product: true }, orderBy: { createdAt: "desc" }, take: limit });
  res.json({ orders: rows.map(publicOrder) });
}));

/** Wallet top-up: returns a checkout URL a human opens to pay with PayWay. Credit happens after verified payment. */
resellerApiRouter.post("/topup-wallet", asyncHandler(async (req, res) => {
  const { amount } = z.object({ amount: z.coerce.number() }).parse(req.body);
  const r = await createWalletTopup(req.reseller!, amount);
  res.status(201).json({ tran_id: r.tranId, amount: r.amount, currency: r.currency, checkout_url: r.checkoutUrl });
}));

resellerApiRouter.get("/transactions", asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await prisma.transaction.findMany({ where: { resellerId: req.reseller!.id }, orderBy: { createdAt: "desc" }, take: limit });
  res.json({
    transactions: rows.map((t) => ({
      id: t.id, type: t.type, status: t.status, amount: t.amount.toFixed(2), currency: t.currency,
      order_id: t.orderId, note: t.note, created_at: t.createdAt.toISOString(),
    })),
  });
}));

resellerApiRouter.post("/webhook/test", asyncHandler(async (req, res) => {
  const r = await prisma.reseller.findUniqueOrThrow({ where: { id: req.reseller!.id } });
  if (!r.webhookUrl) throw badRequest("No webhook URL configured", "NO_WEBHOOK_URL");
  const url = await assertSafeWebhookUrl(r.webhookUrl, !isProd);
  try {
    await sendSignedWebhook(r, url.toString(), { event: "webhook.test", created_at: new Date().toISOString(), data: { message: "TopUpHub test event" } }, { event: "webhook.test", attempt: 1 });
    res.json({ delivered: true });
  } catch (e) {
    res.status(502).json({ delivered: false, error: String((e as Error).message) });
  }
}));

void env;
