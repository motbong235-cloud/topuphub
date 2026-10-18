import { Prisma, type Reseller } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { AppError, badRequest, notFound } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { findProduct, newOrderCode } from "../orders/orders.service";
import { enqueueProcess } from "../orders/queue";
import { getTransactionDetail, paywayConfigured, purchaseForm, requirePayway } from "./payway.client";
import {
  checkKhmerSystemPayment,
  createKhmerSystemQr,
  requireKhmerSystem,
} from "./khmerSystem.client";

const newTranId = () => `${Date.now()}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;

function activeGateway(): "mock" | "payway" | "khmer_system" {
  return env.PAYMENT_GATEWAY_RESOLVED;
}

function ensureGateway() {
  if (env.PAYMENT_SIMULATION) return;
  const g = activeGateway();
  if (g === "khmer_system") requireKhmerSystem();
  else requirePayway();
}

function gatewayName() {
  return activeGateway();
}

export interface CheckoutResult {
  orderId?: string;
  code?: string;
  tranId: string;
  amount: string;
  currency: string;
  checkoutUrl: string;
  simulation: boolean;
  gateway?: string;
}

export async function createOrderCheckout(
  userId: string,
  input: { product: string; target: string; serverId?: string; quantity: number },
): Promise<CheckoutResult> {
  ensureGateway();
  const product = await findProduct(input.product);
  if (!product) throw notFound("Product not found");
  if (product.requiresServer && !input.serverId) {
    throw badRequest("serverId is required for this product", "SERVER_ID_REQUIRED");
  }

  const amount = product.price.mul(input.quantity);
  const tranId = newTranId();
  const code = newOrderCode();
  const gw = gatewayName();
  const order = await prisma.order.create({
    data: {
      code,
      userId,
      productId: product.id,
      source: "WEB",
      target: input.target,
      serverId: input.serverId,
      quantity: input.quantity,
      unitPrice: product.price,
      amount,
      currency: product.currency,
      status: "PENDING_PAYMENT",
      paymentRef: tranId,
      transactions: {
        create: {
          type: "PAYMENT",
          status: "PENDING",
          gateway: gw,
          gatewayTranId: tranId,
          amount,
          currency: product.currency,
          userId,
        },
      },
    },
  });
  return {
    orderId: order.id,
    code,
    tranId,
    amount: amount.toFixed(2),
    currency: product.currency,
    checkoutUrl: `${env.APP_URL}/pay/${tranId}`,
    simulation: env.PAYMENT_SIMULATION,
    gateway: gw,
  };
}

export async function createWalletTopup(reseller: Reseller, amount: number): Promise<CheckoutResult> {
  ensureGateway();
  if (!(amount >= 1 && amount <= 5000)) throw badRequest("amount must be between 1 and 5000");
  const tranId = newTranId();
  const dec = new Prisma.Decimal(amount);
  const gw = gatewayName();
  await prisma.transaction.create({
    data: {
      type: "WALLET_TOPUP",
      status: "PENDING",
      gateway: gw,
      gatewayTranId: tranId,
      amount: dec,
      currency: "USD",
      userId: reseller.userId,
      resellerId: reseller.id,
    },
  });
  return {
    tranId,
    amount: dec.toFixed(2),
    currency: "USD",
    checkoutUrl: `${env.APP_URL}/pay/${tranId}`,
    simulation: env.PAYMENT_SIMULATION,
    gateway: gw,
  };
}

export async function getCheckoutForm(tranId: string) {
  const tx = await prisma.transaction.findUnique({
    where: { gatewayTranId: tranId },
    include: { order: true },
  });
  if (!tx) throw notFound("Payment not found");

  const amount = Number(tx.amount).toFixed(2);
  const base = {
    tranId,
    amount,
    currency: tx.currency,
    orderCode: tx.order?.code,
    status: tx.status,
    simulation: env.PAYMENT_SIMULATION || tx.gateway === "mock",
    gateway: tx.gateway,
  };

  if (base.simulation) return { ...base, simulation: true };
  if (tx.status === "PAID") return { ...base, paid: true };

  if (tx.gateway === "khmer_system") {
    const meta = (tx.pushbackRaw as any) || {};
    if (meta.verify_key && (meta.qr_image || meta.qr_string)) {
      return {
        ...base,
        mode: "khmer_system_qr",
        qr_image: meta.qr_image || "",
        qr_string: meta.qr_string || "",
        verify_key: meta.verify_key,
      };
    }
    const qr = await createKhmerSystemQr(Number(tx.amount), tranId, `TopUpHub ${tx.order?.code || tranId}`);
    if (!qr.success) throw new AppError(502, "QR_FAILED", qr.error || "Failed to create KHQR");
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        pushbackRaw: {
          verify_key: qr.verify_key,
          telegram_user_id: qr.telegram_user_id,
          qr_image: qr.qr_image,
          qr_string: qr.qr_string,
          transaction_id: qr.transaction_id,
        } as Prisma.InputJsonValue,
      },
    });
    return {
      ...base,
      mode: "khmer_system_qr",
      qr_image: qr.qr_image || "",
      qr_string: qr.qr_string || "",
      verify_key: qr.verify_key,
    };
  }

  requirePayway();
  const orderCode = tx.order?.code || "";
  const form = purchaseForm({
    tranId,
    amount,
    currency: tx.currency === "KHR" ? "KHR" : "USD",
    items: [{ name: orderCode || "TopUpHub", quantity: 1, price: amount }],
    buyer: { firstname: "Customer", lastname: "TopUpHub", email: "customer@topuphub.local", phone: "000000000" },
    pushbackUrl: `${env.API_URL}/api/webhooks/payway`,
    cancelUrl: `${env.APP_URL}/orders/${orderCode}`,
    continueUrl: `${env.APP_URL}/orders/${orderCode}`,
  });
  return {
    ...base,
    mode: "payway_form",
    action: form.action,
    method: form.method,
    fields: form.fields,
  };
}

async function settleTransaction(txId: string, extra: Record<string, unknown> = {}) {
  const tx = await prisma.transaction.findUnique({ where: { id: txId } });
  if (!tx) return { settled: false };
  if (tx.status === "PAID") return { settled: false, already: true };

  await prisma.$transaction(async (db) => {
    const updated = await db.transaction.updateMany({
      where: { id: txId, status: "PENDING" },
      data: { status: "PAID", pushbackRaw: extra as Prisma.InputJsonValue },
    });
    if (!updated.count) return;
    if (tx.type === "WALLET_TOPUP" && tx.resellerId) {
      await db.reseller.update({ where: { id: tx.resellerId }, data: { balance: { increment: tx.amount } } });
    }
    if (tx.type === "PAYMENT" && tx.orderId) {
      await db.order.updateMany({ where: { id: tx.orderId, status: "PENDING_PAYMENT" }, data: { status: "PAID" } });
    }
  });

  if (tx.type === "PAYMENT" && tx.orderId) {
    try { await enqueueProcess(tx.orderId); } catch (e) {
      logger.error("enqueue process failed", { orderId: tx.orderId, err: String(e) });
    }
  }
  return { settled: true };
}

export async function verifyAndSettle(tranId: string, pushback?: unknown) {
  const tx = await prisma.transaction.findUnique({ where: { gatewayTranId: tranId } });
  if (!tx) return { found: false as const };
  if (tx.status === "PAID") return { found: true as const, status: "PAID" as const, settled: false, paid: true };

  if (tx.gateway === "khmer_system") {
    const meta = (tx.pushbackRaw as any) || {};
    if (!meta.verify_key) return { found: true as const, status: tx.status, settled: false, paid: false, error: "no_verify_key" };
    const d = await checkKhmerSystemPayment({ verify_key: meta.verify_key, telegram_user_id: meta.telegram_user_id });
    if (!d.paid) return { found: true as const, status: tx.status, settled: false, paid: false, ksStatus: d.status };
    if (d.amount != null && Math.abs(d.amount - Number(tx.amount)) > 0.05) {
      logger.error("Khmer System amount mismatch", { tranId, expected: tx.amount, got: d.amount });
      return { found: true as const, status: tx.status, settled: false, paid: false, mismatch: true };
    }
    const s = await settleTransaction(tx.id, { pushback: pushback ?? null, verified: d.raw });
    return { found: true as const, status: "PAID" as const, settled: s.settled, paid: true };
  }

  if (tx.gateway === "payway") {
    const d = await getTransactionDetail(tranId);
    if (!d.paid) return { found: true as const, status: tx.status, settled: false, paid: false };
    if (d.amount !== null && Math.abs(d.amount - Number(tx.amount)) > 0.005) {
      logger.error("PayWay amount mismatch", { tranId, expected: tx.amount.toFixed(2), got: d.amount });
      return { found: true as const, status: tx.status, settled: false, paid: false, mismatch: true };
    }
    const s = await settleTransaction(tx.id, { pushback: pushback ?? null, verified: d.raw });
    return { found: true as const, status: "PAID" as const, settled: s.settled, paid: true };
  }

  return { found: true as const, status: tx.status, settled: false, paid: false };
}

export async function simulatePaid(tranId: string, userId: string, isAdmin: boolean) {
  if (!env.PAYMENT_SIMULATION) throw new AppError(404, "NOT_FOUND", "Not found");
  const tx = await prisma.transaction.findUnique({ where: { gatewayTranId: tranId } });
  if (!tx || tx.gateway !== "mock") throw notFound("Payment not found");
  if (!isAdmin && tx.userId !== userId) throw notFound("Payment not found");
  return settleTransaction(tx.id, { simulated: true });
}

export async function reconcilePendingPayments() {
  const pending = await prisma.transaction.findMany({
    where: {
      status: "PENDING",
      gateway: { in: ["payway", "khmer_system"] },
      type: { in: ["PAYMENT", "WALLET_TOPUP"] },
      createdAt: { lt: new Date(Date.now() - 60_000) },
    },
    take: 50,
    orderBy: { createdAt: "asc" },
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
