import { Prisma, type Order, type Product, type Reseller } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError, badRequest, conflict, notFound } from "../../lib/errors";
import { randomToken } from "../../lib/crypto";
import { logger } from "../../lib/logger";
import { enqueueProcess, enqueueWebhook } from "./queue";

export const newOrderCode = () => `TH${Date.now().toString(36).toUpperCase()}${randomToken(2).toUpperCase()}`;

export type OrderWithProduct = Order & { product: Product };

/** Shape returned to customers and resellers (no provider internals). */
export function publicOrder(o: OrderWithProduct) {
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    product: { id: o.product.id, slug: o.product.slug, name: o.product.name },
    target: o.target,
    server_id: o.serverId,
    quantity: o.quantity,
    unit_price: o.unitPrice.toFixed(2),
    amount: o.amount.toFixed(2),
    currency: o.currency,
    reference: o.resellerRef,
    fail_reason: o.status === "FAILED" || o.status === "REFUNDED" ? o.failReason : null,
    created_at: o.createdAt.toISOString(),
    completed_at: o.completedAt?.toISOString() ?? null,
  };
}

export async function findProduct(idOrSlug: string) {
  return prisma.product.findFirst({ where: { active: true, OR: [{ id: idOrSlug }, { slug: idOrSlug }] } });
}

export interface ResellerOrderInput {
  product: string; // slug or id
  target: string;
  serverId?: string;
  quantity: number;
  reference?: string;
}

/**
 * Reseller order paid from the wallet.
 * Idempotent per (reseller, X-IDEMPOTENCY-KEY); the balance debit and the order are ONE database transaction.
 */
export async function createResellerOrder(reseller: Reseller, input: ResellerOrderInput, idemKey: string) {
  const product = await findProduct(input.product);
  if (!product) throw notFound("Product not found");
  if (product.requiresServer && !input.serverId) throw badRequest("server_id is required for this product", "SERVER_ID_REQUIRED");

  const existing = await prisma.order.findUnique({
    where: { resellerId_idempotencyKey: { resellerId: reseller.id, idempotencyKey: idemKey } },
    include: { product: true },
  });
  const sameRequest = (o: OrderWithProduct) =>
    o.productId === product.id && o.target === input.target && o.quantity === input.quantity && (o.serverId ?? "") === (input.serverId ?? "");
  if (existing) {
    if (!sameRequest(existing)) throw conflict("Idempotency key was already used with a different request", "IDEMPOTENCY_MISMATCH");
    return { order: existing, replay: true };
  }

  const unit = product.resellerPrice;
  const amount = unit.mul(input.quantity);

  try {
    const order = await prisma.$transaction(async (tx) => {
      // Atomic conditional debit: succeeds only if the balance covers the amount (no race, no negative balance).
      const debited = await tx.reseller.updateMany({
        where: { id: reseller.id, active: true, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (debited.count === 0) throw new AppError(402, "INSUFFICIENT_BALANCE", "Insufficient wallet balance");

      const created = await tx.order.create({
        data: {
          code: newOrderCode(),
          resellerId: reseller.id,
          productId: product.id,
          source: "RESELLER",
          target: input.target,
          serverId: input.serverId,
          quantity: input.quantity,
          unitPrice: unit,
          amount,
          currency: product.currency,
          status: "PAID", // wallet payment is immediate
          idempotencyKey: idemKey,
          resellerRef: input.reference,
        },
        include: { product: true },
      });
      await tx.transaction.create({
        data: { orderId: created.id, resellerId: reseller.id, type: "ORDER_DEBIT", status: "PAID", gateway: "wallet", amount, currency: product.currency },
      });
      return created;
    });
    await enqueueProcess(order.id);
    return { order, replay: false };
  } catch (e) {
    // Two concurrent requests with the same key: the loser's transaction rolled back (no double debit) -> replay winner.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const winner = await prisma.order.findUnique({
        where: { resellerId_idempotencyKey: { resellerId: reseller.id, idempotencyKey: idemKey } },
        include: { product: true },
      });
      if (winner && sameRequest(winner)) return { order: winner, replay: true };
    }
    throw e;
  }
}

export async function notifyReseller(orderId: string, event: "order.completed" | "order.failed" | "order.refunded") {
  try {
    const o = await prisma.order.findUnique({ where: { id: orderId }, include: { reseller: true } });
    if (o?.resellerId && o.reseller?.webhookUrl) await enqueueWebhook(orderId, event);
  } catch (e) {
    logger.warn("could not enqueue reseller webhook", { orderId, err: String(e) });
  }
}

export async function completeOrder(orderId: string) {
  const r = await prisma.order.updateMany({
    where: { id: orderId, status: { in: ["PAID", "PROCESSING"] } },
    data: { status: "COMPLETED", completedAt: new Date(), needsReview: false, failReason: null },
  });
  if (r.count) await notifyReseller(orderId, "order.completed");
  return r.count > 0;
}

/**
 * Delivery failed for good.
 *  - reseller orders: wallet is credited back automatically -> REFUNDED
 *  - web orders: money was taken by PayWay -> FAILED + a PENDING refund transaction for an admin to settle
 */
export async function failOrder(orderId: string, reason: string) {
  const result = await prisma.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id: orderId }, include: { transactions: true } });
    if (!o || !["PAID", "PROCESSING"].includes(o.status)) return null;
    const msg = reason.slice(0, 300);

    if (o.source === "RESELLER" && o.resellerId) {
      await tx.reseller.update({ where: { id: o.resellerId }, data: { balance: { increment: o.amount } } });
      await tx.transaction.create({
        data: { orderId: o.id, resellerId: o.resellerId, type: "REFUND", status: "PAID", gateway: "wallet", amount: o.amount, currency: o.currency, note: msg },
      });
      await tx.order.update({ where: { id: o.id }, data: { status: "REFUNDED", failReason: msg } });
      return "order.refunded" as const;
    }

    const paid = o.transactions.find((t) => t.type === "PAYMENT");
    await tx.transaction.create({
      data: { orderId: o.id, userId: o.userId, type: "REFUND", status: "PENDING", gateway: paid?.gateway ?? "payway", amount: o.amount, currency: o.currency, note: `Refund required: ${msg}` },
    });
    await tx.order.update({ where: { id: o.id }, data: { status: "FAILED", failReason: msg } });
    return "order.failed" as const;
  });
  if (result) await notifyReseller(orderId, result);
  return result;
}
