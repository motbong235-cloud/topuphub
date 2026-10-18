import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/asyncHandler";
import { notFound } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";
import { webhookLimiter } from "../../middleware/rateLimit";
import { publicOrder } from "../orders/orders.service";
import { createOrderCheckout, getCheckoutForm, simulatePaid, verifyAndSettle } from "./payments.service";

export const paymentsRouter = Router();
export const webhooksRouter = Router();

const createSchema = z.object({
  productId: z.string().min(1).max(100), // product id or slug
  target: z.string().trim().min(1).max(64),
  serverId: z.string().trim().max(32).optional(),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
});

/** Cart -> order + payment. Returns the hosted checkout URL (PayWay form page) to redirect the customer to. */
paymentsRouter.post("/payway/create", requireAuth(), asyncHandler(async (req, res) => {
  const b = createSchema.parse(req.body);
  const r = await createOrderCheckout(req.user!.id, { product: b.productId, target: b.target, serverId: b.serverId || undefined, quantity: b.quantity });
  res.status(201).json(r);
}));

/** Public: the unguessable tran_id is the capability. Returns the PayWay form (or the simulation flag). */
paymentsRouter.get("/checkout/:tranId", asyncHandler(async (req, res) => {
  res.json(await getCheckoutForm(req.params.tranId));
}));


/** Public poll for Khmer System / PayWay checkout page. */
paymentsRouter.get("/poll/:tranId", asyncHandler(async (req, res) => {
  const r = await verifyAndSettle(req.params.tranId).catch(() => ({ found: false, paid: false }));
  res.json(r);
}));

/** Poll fallback: also asks PayWay directly if the pushback has not arrived yet. */
paymentsRouter.get("/:code/status", requireAuth(), asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { userId: req.user!.id, OR: [{ code: req.params.code }, { id: req.params.code }] },
    include: { product: true, transactions: true },
  });
  if (!order) throw notFound("Order not found");
  const pay = order.transactions.find((t) => t.type === "PAYMENT");
  if (order.status === "PENDING_PAYMENT" && pay?.gatewayTranId) {
    await verifyAndSettle(pay.gatewayTranId).catch(() => undefined);
    const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { product: true } });
    return res.json({ order: publicOrder(fresh), payment_status: (await prisma.transaction.findUniqueOrThrow({ where: { id: pay.id } })).status });
  }
  res.json({ order: publicOrder(order), payment_status: pay?.status ?? null });
}));

if (env.PAYMENT_SIMULATION) {
  paymentsRouter.post("/simulate/:tranId/confirm", requireAuth(), asyncHandler(async (req, res) => {
    res.json(await simulatePaid(req.params.tranId, req.user!.id, req.user!.role === "ADMIN"));
  }));
}

/**
 * PayWay pushback. The body is NEVER trusted: we extract tran_id, then verify with PayWay's
 * transaction-detail API, compare the amount, and only then settle (idempotent). status "00" = success in the pushback.
 */
webhooksRouter.post("/payway", webhookLimiter, asyncHandler(async (req, res) => {
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const tranId = String(body.tran_id ?? "").slice(0, 64);
  const tx = tranId ? await prisma.transaction.findUnique({ where: { gatewayTranId: tranId } }) : null;
  let error: string | undefined;
  try {
    if (tranId) await verifyAndSettle(tranId, body);
  } catch (e) {
    error = String(e);
  }
  await prisma.webhookLog.create({
    data: {
      resellerId: tx?.resellerId ?? undefined, orderId: tx?.orderId ?? undefined, direction: "in_payway", event: "payway.pushback",
      payload: body as Prisma.InputJsonValue, success: !error, error,
    },
  });
  // 500 makes PayWay retry; the 60s reconciler is the second safety net.
  res.status(error ? 500 : 200).json({ ok: !error });
}));
