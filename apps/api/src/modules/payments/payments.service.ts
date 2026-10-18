import { Prisma, type Reseller } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { AppError, badRequest, conflict, notFound } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { findProduct, newOrderCode } from "../orders/orders.service";
import { enqueueProcess } from "../orders/queue";
import { getTransactionDetail, paywayConfigured, purchaseForm, requirePayway } from "./payway.client";

const gatewayName = () => (env.PAYMENT_SIMULATION ? "mock" : "payway");
const newTranId = () => `${Date.now()}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`; // 16 digits
const ensureGateway = () => { if (!env.PAYMENT_SIMULATION) requirePayway(); };

export interface CheckoutResult {
  orderId?: string;
  code?: string;
  tranId: string;
  amount: string;
  currency: string;
  checkoutUrl: string;
  simulation: boolean;
}

/** End-user checkout: creates the order (PENDING_PAYMENT) + a PENDING payment transaction. */
export async function createOrderCheckout(
  userId: string,
  input: { product: string; target: string; serverId?: string; quantity: number },
): Promise<CheckoutResult> {
  ensureGateway();
  const product = await findProduct(input.product);
  if (!product) throw notFound("Product not found");
  if (product.requiresServer && !input.serverId) throw badRequest("serverId is required for this product", "SERVER_ID_REQUIRED");

  const amount = product.price.mul(input.quantity);
  const tranId = newTranId();
  const code = newOrderCode();
  const order = await prisma.order.create({
    data: {
      code, userId, productId: product.id, source: "WEB", target: input.target, serverId: input.serverId,
      quantity: input.quantity, unitPrice: product.price, amount, currency: product.currency,
      status: "PENDING_PAYMENT", paymentRef: tranId,
      transactions: { create: { type: "PAYMENT", status: "PENDING", gateway: gatewayName(), gatewayTranId: tranId, amount, currency: product.currency, userId } },
    },
  });
  return { orderId: order.id, code, tranId, amount: amount.toFixed(2), currency: product.currency, checkoutUrl: `${env.APP_URL}/pay/${tranId}`, simulation: env.PAYMENT_SIMULATION };
}

/** Reseller wallet top-up through the gateway. Credited only after the payment is verified. */
export async function createWalletTopup(reseller: Reseller, amount: number): Promise<CheckoutResult> {
  ensureGateway();
  if (!(amount >= 1 && amount <= 5000)) throw badRequest("amount must be between 1 and 5000", "INVALID_AMOUNT");
  const tranId = newTranId();
  const dec = new Prisma.Decimal(amount.toFixed(2));
  await prisma.transaction.create({
    data: { resellerId: reseller.id, userId: reseller.userId, type: "WALLET_TOPUP", status: "PENDING", gateway: gatewayName(), gatewayTranId: tranId, amount: dec, currency: "USD" },
  });
  return { tranId, amount: dec.toFixed(2), currency: "USD", checkoutUrl: `${env.APP_URL}/pay/${tranId}`, simulation: env.PAYMENT_SIMULATION };
}

/** Data for the hosted checkout page: a form the browser POSTs to PayWay (or a simulation flag). */
export async function getCheckoutForm(tranId: string) {
  const tx = await prisma.transaction.findUnique({
    where: { gatewayTranId: tranId },
    include: { order: { include: { product: true } }, user: true },
  });
  if (!tx) throw notFound("Payment not found");
  if (tx.status !== "PENDING") throw conflict("This payment is no longer pending", "NOT_PENDING");
  if (tx.gateway === "mock") return { simulation: true as const, tranId, amount: tx.amount.toFixed(2), currency: tx.currency, orderCode: tx.order?.code ?? null };

  const name = (tx.user?.name ?? "").trim().split(/\s+/);
  const firstname = (name[0] || "Customer").slice(0, 20);
  const lastname = (name.slice(1).join(" ") || "-").slice(0, 20);
  const back = tx.order ? `${env.APP_URL}/orders/${tx.order.code}` : `${env.APP_URL}/reseller`;
  const items = tx.order
    ? [{ name: tx.order.product.name.slice(0, 60), quantity: tx.order.quantity, price: tx.order.unitPrice.toFixed(2) }]
    : [{ name: "Wallet top-up", quantity: 1, price: tx.amount.toFixed(2) }];

  const form = purchaseForm({
    tranId, amount: tx.amount.toFixed(2), currency: tx.currency, items,
    buyer: { firstname, lastname, email: tx.user?.email ?? "", phone: "" },
    pushbackUrl: `${env.API_URL}/api/webhooks/payway`,
    cancelUrl: `${back}?cancelled=1`,
    continueUrl: back,
  });
  return { simulation: false as const, ...form };
}

/**
 * Mark a PENDING transaction as PAID exactly once, then apply its effect:
 *   WALLET_TOPUP -> credit the reseller balance;  PAYMENT -> order PAID and enqueue "process-order".
 */
export async function settleTransaction(txId: string, raw?: unknown): Promise<{ settled: boolean; orderId?: string }> {
  const outcome = await prisma.$transaction(async (db) => {
    const claimed = await db.transaction.updateMany({
      where: { id: txId, status: "PENDING" },
      data: { status: "PAID", pushbackRaw: raw === undefined ? undefined : (raw as Prisma.InputJsonValue) },
    });
    if (claimed.count === 0) return null; // already settled (duplicate pushback) -> idempotent
    const tx = await db.transaction.findUniqueOrThrow({ where: { id: txId } });
    if (tx.type === "WALLET_TOPUP" && tx.resellerId) {
      await db.reseller.update({ where: { id: tx.resellerId }, data: { balance: { increment: tx.amount } } });
      return { orderId: undefined };
    }
    if (tx.orderId) {
      await db.order.updateMany({ where: { id: tx.orderId, status: "PENDING_PAYMENT" }, data: { status: "PAID" } });
      return { orderId: tx.orderId };
    }
    return { orderId: undefined };
  });
  if (!outcome) return { settled: false };
  if (outcome.orderId) await enqueueProcess(outcome.orderId);
  return { settled: true, orderId: outcome.orderId };
}

/** Never trust a pushback body: ask PayWay about the transaction, compare the amount, then settle. */
export async function verifyAndSettle(tranId: string, pushback?: unknown) {
  const tx = await prisma.transaction.findUnique({ where: { gatewayTranId: tranId } });
  if (!tx) return { found: false as const };
  if (tx.status !== "PENDING") return { found: true as const, status: tx.status, settled: false };
  if (tx.gateway !== "payway" || !paywayConfigured()) return { found: true as const, status: tx.status, settled: false };

  const d = await getTransactionDetail(tranId);
  if (!d.paid) return { found: true as const, status: tx.status, settled: false, paid: false };
  if (d.amount !== null && Math.abs(d.amount - Number(tx.amount)) > 0.005) {
    logger.error("PayWay amount mismatch", { tranId, expected: tx.amount.toFixed(2), got: d.amount });
    await prisma.transaction.update({ where: { id: tx.id }, data: { note: `Amount mismatch: expected ${tx.amount.toFixed(2)}, PayWay says ${d.amount}`, pushbackRaw: d.raw as Prisma.InputJsonValue } });
    return { found: true as const, status: tx.status, settled: false, paid: false, mismatch: true };
  }
  const s = await settleTransaction(tx.id, { pushback: pushback ?? null, verified: d.raw });
  return { found: true as const, status: "PAID" as const, settled: s.settled, paid: true };
}

/** PAYMENT_SIMULATION only: pretend PayWay confirmed the payment. */
export async function simulatePaid(tranId: string, userId: string, isAdmin: boolean) {
  if (!env.PAYMENT_SIMULATION) throw new AppError(404, "NOT_FOUND", "Not found");
  const tx = await prisma.transaction.findUnique({ where: { gatewayTranId: tranId } });
  if (!tx || tx.gateway !== "mock") throw notFound("Payment not found");
  if (!isAdmin && tx.userId !== userId) throw notFound("Payment not found");
  return settleTransaction(tx.id, { simulated: true });
}

/** Sweeper: settle payments whose pushback was lost; expire payments that were never completed. */
export async function reconcilePendingPayments() {
  if (!paywayConfigured()) return;
  const pending = await prisma.transaction.findMany({
    where: { status: "PENDING", gateway: "payway", type: { in: ["PAYMENT", "WALLET_TOPUP"] }, createdAt: { lt: new Date(Date.now() - 60_000) } },
    take: 50, orderBy: { createdAt: "asc" },
  });
  for (const tx of pending) {
    if (!tx.gatewayTranId) continue;
    try {
      const r = await verifyAndSettle(tx.gatewayTranId);
      const stale = Date.now() - tx.createdAt.getTime() > 2 * 3600_000;
      if (stale && !(r as any).paid && !(r as any).mismatch) {
        await prisma.$transaction([
          prisma.transaction.updateMany({ where: { id: tx.id, status: "PENDING" }, data: { status: "FAILED", note: "Expired (not paid within 2h)" } }),
          prisma.order.updateMany({ where: { id: tx.orderId ?? "", status: "PENDING_PAYMENT" }, data: { status: "FAILED", failReason: "Payment expired" } }),
        ]);
      }
    } catch (e) {
      logger.warn("reconcile failed", { tranId: tx.gatewayTranId, err: String(e) });
    }
  }
}
