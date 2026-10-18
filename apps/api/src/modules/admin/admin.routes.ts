import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/asyncHandler";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { encryptSecret, randomToken } from "../../lib/crypto";
import { requireAuth } from "../../middleware/auth";
import { completeOrder, failOrder, publicOrder } from "../orders/orders.service";
import { orderQueue } from "../orders/queue";

export const adminRouter = Router();
adminRouter.use(requireAuth("ADMIN"));

const money = z.coerce.number().positive().max(100000).transform((n) => new Prisma.Decimal(n.toFixed(2)));
const productBase = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/, "lowercase letters, digits and dashes"),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).nullish(),
  category: z.string().trim().min(1).max(40).default("game"),
  imageUrl: z.string().url().max(300).nullish().or(z.literal("")),
  price: money,
  resellerPrice: money,
  currency: z.enum(["USD", "KHR"]).default("USD"),
  providerCode: z.string().trim().min(1).max(60),
  requiresServer: z.boolean().default(false),
  active: z.boolean().default(true),
  sort: z.coerce.number().int().default(0),
});
const clean = <T extends { imageUrl?: string | null }>(d: T) => ({ ...d, imageUrl: d.imageUrl || null });

adminRouter.get("/stats", asyncHandler(async (_req, res) => {
  const [byStatus, revenue, resellers, refundsPending, review, users] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: true }),
    prisma.order.aggregate({ where: { status: "COMPLETED" }, _sum: { amount: true } }),
    prisma.reseller.count(),
    prisma.transaction.count({ where: { type: "REFUND", status: "PENDING" } }),
    prisma.order.count({ where: { needsReview: true } }),
    prisma.user.count(),
  ]);
  res.json({
    orders_by_status: Object.fromEntries(byStatus.map((g) => [g.status, g._count])),
    completed_revenue: (revenue._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
    resellers, users, refunds_pending: refundsPending, needs_review: review,
  });
}));

// ---- products
adminRouter.get("/products", asyncHandler(async (_req, res) => {
  const rows = await prisma.product.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }] });
  res.json({ products: rows });
}));
adminRouter.post("/products", asyncHandler(async (req, res) => {
  const d = clean(productBase.parse(req.body));
  if (await prisma.product.findUnique({ where: { slug: d.slug } })) throw conflict("Slug already exists", "SLUG_TAKEN");
  res.status(201).json({ product: await prisma.product.create({ data: d }) });
}));
adminRouter.put("/products/:id", asyncHandler(async (req, res) => {
  const d = clean(productBase.partial().parse(req.body));
  res.json({ product: await prisma.product.update({ where: { id: req.params.id }, data: d }) });
}));
adminRouter.delete("/products/:id", asyncHandler(async (req, res) => {
  // Soft delete: orders keep their product reference.
  await prisma.product.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
}));

// ---- orders
adminRouter.get("/orders", asyncHandler(async (req, res) => {
  const { status, q, review } = z.object({
    status: z.enum(["PENDING_PAYMENT", "PAID", "PROCESSING", "COMPLETED", "FAILED", "REFUNDED"]).optional(),
    q: z.string().max(60).optional(), review: z.enum(["1"]).optional(),
  }).parse(req.query);
  const rows = await prisma.order.findMany({
    where: {
      ...(status ? { status } : {}), ...(review ? { needsReview: true } : {}),
      ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { target: { contains: q } }, { providerRef: { contains: q } }] } : {}),
    },
    include: { product: true, user: { select: { email: true } }, reseller: { select: { apiKey: true } } },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  res.json({
    orders: rows.map((o) => ({ ...publicOrder(o), source: o.source, provider_ref: o.providerRef, payment_ref: o.paymentRef, needs_review: o.needsReview, fail_reason: o.failReason, user_email: o.user?.email ?? null, reseller_key: o.reseller?.apiKey ?? null })),
  });
}));

adminRouter.post("/orders/:id/retry", asyncHandler(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!o) throw notFound("Order not found");
  if (!["PAID", "PROCESSING"].includes(o.status)) throw badRequest("Only PAID/PROCESSING orders can be retried");
  if (o.needsReview && !o.providerRef) {
    // Outcome at the provider is unknown: the admin must have verified that nothing was delivered.
    if (req.body?.confirmNotDelivered !== true) throw badRequest("Confirm that the provider did NOT deliver this order (confirmNotDelivered: true)", "CONFIRM_REQUIRED");
  }
  await prisma.order.update({ where: { id: o.id }, data: { needsReview: false, failReason: null } });
  await orderQueue.add("process-order", { orderId: o.id }, { jobId: `order_${o.id}_r${Date.now()}` });
  res.json({ ok: true });
}));

adminRouter.post("/orders/:id/resolve", asyncHandler(async (req, res) => {
  const { outcome, note } = z.object({ outcome: z.enum(["COMPLETED", "FAILED"]), note: z.string().max(200).optional() }).parse(req.body);
  if (outcome === "COMPLETED") await completeOrder(req.params.id);
  else await failOrder(req.params.id, note || "Failed (resolved by admin)");
  res.json({ ok: true });
}));

// ---- refunds / transactions
adminRouter.post("/refunds/:txId/done", asyncHandler(async (req, res) => {
  const r = await prisma.transaction.updateMany({ where: { id: req.params.txId, type: "REFUND", status: "PENDING" }, data: { status: "PAID", note: `Refunded manually by admin at ${new Date().toISOString()}` } });
  if (!r.count) throw notFound("No pending refund with that id");
  res.json({ ok: true });
}));

adminRouter.get("/transactions", asyncHandler(async (req, res) => {
  const { type, status } = z.object({
    type: z.enum(["PAYMENT", "WALLET_TOPUP", "ORDER_DEBIT", "REFUND"]).optional(),
    status: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED"]).optional(),
  }).parse(req.query);
  const rows = await prisma.transaction.findMany({ where: { ...(type ? { type } : {}), ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ transactions: rows.map((t) => ({ id: t.id, type: t.type, status: t.status, gateway: t.gateway, tran_id: t.gatewayTranId, amount: t.amount.toFixed(2), currency: t.currency, order_id: t.orderId, reseller_id: t.resellerId, note: t.note, at: t.createdAt.toISOString() })) });
}));

adminRouter.get("/provider-logs", asyncHandler(async (_req, res) => {
  res.json({ logs: await prisma.providerLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }) });
}));

// ---- resellers
adminRouter.get("/resellers", asyncHandler(async (_req, res) => {
  const rows = await prisma.reseller.findMany({ include: { user: { select: { email: true, name: true } } }, orderBy: { createdAt: "desc" } });
  res.json({ resellers: rows.map((r) => ({ id: r.id, email: r.user.email, name: r.user.name, api_key: r.apiKey, balance: r.balance.toFixed(2), webhook_url: r.webhookUrl, rate_limit_per_min: r.rateLimitPerMin, active: r.active, created_at: r.createdAt.toISOString() })) });
}));

/** Turns an existing user into a reseller. The API secret is returned ONCE. */
adminRouter.post("/resellers", asyncHandler(async (req, res) => {
  const { email } = z.object({ email: z.string().email().transform((s) => s.toLowerCase()) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email }, include: { reseller: true } });
  if (!user) throw notFound("No user with that email (they must register first)");
  if (user.reseller) throw conflict("User is already a reseller", "ALREADY_RESELLER");
  const apiKey = `pk_${randomToken(12)}`;
  const apiSecret = `sk_${randomToken(24)}`;
  const webhookSecret = `whsec_${randomToken(24)}`;
  await prisma.$transaction([
    prisma.reseller.create({ data: { userId: user.id, apiKey, apiSecretEnc: encryptSecret(apiSecret, env.SECRETS_KEY), webhookSecretEnc: encryptSecret(webhookSecret, env.SECRETS_KEY) } }),
    ...(user.role === "ADMIN" ? [] : [prisma.user.update({ where: { id: user.id }, data: { role: "RESELLER" } })]),
  ]);
  res.status(201).json({ api_key: apiKey, api_secret: apiSecret, webhook_secret: webhookSecret });
}));

adminRouter.put("/resellers/:id", asyncHandler(async (req, res) => {
  const d = z.object({ active: z.boolean().optional(), rateLimitPerMin: z.coerce.number().int().min(1).max(6000).optional() }).parse(req.body);
  await prisma.reseller.update({ where: { id: req.params.id }, data: d }); // never echo the encrypted secrets back
  res.json({ ok: true });
}));

adminRouter.post("/resellers/:id/credit", asyncHandler(async (req, res) => {
  const { amount, note } = z.object({ amount: z.coerce.number().positive().max(100000), note: z.string().max(200).optional() }).parse(req.body);
  const dec = new Prisma.Decimal(amount.toFixed(2));
  await prisma.$transaction([
    prisma.reseller.update({ where: { id: req.params.id }, data: { balance: { increment: dec } } }),
    prisma.transaction.create({ data: { resellerId: req.params.id, type: "WALLET_TOPUP", status: "PAID", gateway: "manual", amount: dec, note: note ?? "Manual credit by admin" } }),
  ]);
  res.json({ ok: true });
}));
