import crypto from "crypto";

/** PayWay signs requests with Base64(HMAC-SHA512(concatenated fields, API key)). */
export const paywayHash = (b4hash: string, apiKey: string) =>
  crypto.createHmac("sha512", apiKey).update(b4hash).digest("base64");

/** PayWay req_time: UTC, YYYYMMDDHHmmss */
export function paywayReqTime(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export interface PurchaseInput {
  merchantId: string;
  apiKey: string;
  tranId: string;
  amount: string; // e.g. "1.50"
  currency: string; // "USD" | "KHR"
  items: { name: string; quantity: number; price: string }[];
  buyer: { firstname: string; lastname: string; email: string; phone: string };
  pushbackUrl: string; // server-to-server notification (sent base64-encoded as return_url)
  cancelUrl: string;
  continueUrl: string;
  reqTime?: string;
}

/**
 * Build the hosted-checkout form fields for POST /api/payment-gateway/v1/payments/purchase.
 * Hash string order (from PayWay docs):
 *   req_time + merchant_id + tran_id + amount + items + shipping + ctid + pwt + firstname + lastname + email +
 *   phone + type + payment_option + return_url + cancel_url + continue_success_url + return_deeplink +
 *   currency + custom_fields + return_params
 * Empty optional fields contribute an empty string and are not sent.
 */
export function buildPurchaseFields(i: PurchaseInput): Record<string, string> {
  const req_time = i.reqTime ?? paywayReqTime();
  const items = Buffer.from(
    JSON.stringify(i.items.map((x) => ({ name: x.name, quantity: String(x.quantity), price: x.price }))),
  ).toString("base64");
  const return_url = Buffer.from(i.pushbackUrl).toString("base64");
  const shipping = "0";
  const type = "purchase";
  const f = {
    req_time, merchant_id: i.merchantId, tran_id: i.tranId, amount: i.amount, items, shipping,
    firstname: i.buyer.firstname, lastname: i.buyer.lastname, email: i.buyer.email, phone: i.buyer.phone,
    type, return_url, cancel_url: i.cancelUrl, continue_success_url: i.continueUrl, currency: i.currency,
  };
  const b4hash =
    f.req_time + f.merchant_id + f.tran_id + f.amount + f.items + f.shipping +
    "" /* ctid */ + "" /* pwt */ +
    f.firstname + f.lastname + f.email + f.phone + f.type +
    "" /* payment_option */ + f.return_url + f.cancel_url + f.continue_success_url +
    "" /* return_deeplink */ + f.currency + "" /* custom_fields */ + "" /* return_params */;
  return { ...f, hash: paywayHash(b4hash, i.apiKey) };
}

/** Body for POST /api/payment-gateway/v1/payments/transaction-detail */
export function buildStatusRequest(merchantId: string, apiKey: string, tranId: string, reqTime = paywayReqTime()) {
  return { req_time: reqTime, merchant_id: merchantId, tran_id: tranId, hash: paywayHash(reqTime + merchantId + tranId, apiKey) };
}

const PAID_STATES = ["APPROVED", "COMPLETED", "SUCCESS", "PAID", "SETTLED"];

/** Interpret a transaction-detail response. Field names are read defensively; unverified fields are logged raw. */
export function interpretTransactionDetail(raw: any): { paid: boolean; amount: number | null } {
  const code = raw?.status?.code ?? raw?.status;
  const state = String(raw?.data?.payment_status ?? raw?.payment_status ?? "").toUpperCase();
  const amt = raw?.data?.original_amount ?? raw?.data?.payment_amount ?? raw?.data?.total_amount ?? raw?.data?.amount;
  const n = amt === undefined || amt === null || amt === "" ? null : Number(amt);
  return { paid: String(code) === "00" && PAID_STATES.includes(state), amount: Number.isFinite(n as number) ? (n as number) : null };
}
