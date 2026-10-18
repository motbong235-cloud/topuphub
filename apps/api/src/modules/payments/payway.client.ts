import { env } from "../../config/env";
import { AppError } from "../../lib/errors";
import { buildPurchaseFields, buildStatusRequest, interpretTransactionDetail, type PurchaseInput } from "./payway.sign";

export const paywayConfigured = () => Boolean(env.PAYWAY_MERCHANT_ID && env.PAYWAY_API_KEY);

export function requirePayway() {
  if (!paywayConfigured()) throw new AppError(503, "GATEWAY_NOT_CONFIGURED", "Payment gateway is not configured");
  return { merchantId: env.PAYWAY_MERCHANT_ID as string, apiKey: env.PAYWAY_API_KEY as string };
}

/** Fields the browser must POST (form) to PayWay's hosted checkout. */
export function purchaseForm(p: Omit<PurchaseInput, "merchantId" | "apiKey">) {
  const c = requirePayway();
  return {
    action: `${env.PAYWAY_BASE}/api/payment-gateway/v1/payments/purchase`,
    method: "POST" as const,
    fields: buildPurchaseFields({ ...p, ...c }),
  };
}

/** Server-side verification: ask PayWay directly instead of trusting the pushback body. */
export async function getTransactionDetail(tranId: string): Promise<{ paid: boolean; amount: number | null; raw: unknown }> {
  const c = requirePayway();
  const res = await fetch(`${env.PAYWAY_BASE}/api/payment-gateway/v1/payments/transaction-detail`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(buildStatusRequest(c.merchantId, c.apiKey, tranId)),
    signal: AbortSignal.timeout(15_000),
  });
  const raw: any = await res.json().catch(() => ({}));
  const r = interpretTransactionDetail(raw);
  return { ...r, raw };
}
