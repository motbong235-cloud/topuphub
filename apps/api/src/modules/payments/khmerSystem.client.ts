import { env } from "../../config/env";

const payBase = () => (env.KHMER_SYSTEM_PAY_URL || "https://pay.khmer-system.com").replace(/\/+$/, "");

function clean(v?: string | null) {
  return String(v || "")
    .replace(/[\s\u200b\ufeff]+/g, "")
    .replace(/^["'`]+|["'`]+$/g, "");
}

function secretKey() {
  return clean(env.KHMER_SYSTEM_SECRET_KEY || env.ABA_API_KEY);
}

function tgUserId() {
  return clean(env.KHMER_SYSTEM_TG_USER_ID) || "0";
}

export function khmerSystemConfigured() {
  return Boolean(secretKey());
}

export function requireKhmerSystem() {
  if (!khmerSystemConfigured()) {
    const err: any = new Error("Khmer System is not configured (KHMER_SYSTEM_SECRET_KEY)");
    err.status = 503;
    err.code = "GATEWAY_NOT_CONFIGURED";
    throw err;
  }
  return { secretKey: secretKey() as string };
}

export function makeVerifyKey(seed: string) {
  const raw = String(seed || "") + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const alnum = raw.replace(/[^a-zA-Z0-9]/g, "");
  return (alnum + "ABCDEFGHJKMNPQRSTUVWXYZ23456789").slice(0, 10);
}

export interface KsCreateResult {
  success: boolean;
  qr_image?: string;
  qr_string?: string;
  transaction_id?: string;
  verify_key: string;
  telegram_user_id: string;
  error?: string;
  raw?: unknown;
}

export async function createKhmerSystemQr(
  amount: number,
  billNumber: string,
  description = "TopUpHub",
): Promise<KsCreateResult> {
  requireKhmerSystem();
  const verify_key = makeVerifyKey(billNumber);
  const telegram_user_id = tgUserId();
  const payload: Record<string, unknown> = {
    secret_key: secretKey(),
    amount: Number(amount),
    verify_key,
    telegram_user_id,
  };
  if (description) payload.description = description;

  try {
    const r = await fetch(`${payBase()}/api/v1/payment/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const data: any = await r.json().catch(() => ({}));
    if (data.success && (data.qr_image_url || data.qr_string || data.transaction_id || data.qr_image)) {
      return {
        success: true,
        qr_image: data.qr_image_url || data.qr_image || data.qr || "",
        qr_string: data.qr_string || data.qr_data || "",
        transaction_id: data.transaction_id || billNumber,
        verify_key,
        telegram_user_id,
        raw: data,
      };
    }
    return {
      success: false,
      error: data.error || data.message || `HTTP ${r.status}`,
      verify_key,
      telegram_user_id,
      raw: data,
    };
  } catch (e: any) {
    return { success: false, error: e.message || String(e), verify_key, telegram_user_id };
  }
}

export async function checkKhmerSystemPayment(meta: {
  verify_key: string;
  telegram_user_id?: string;
}): Promise<{ paid: boolean; status?: string; amount?: number; error?: string; raw?: unknown }> {
  if (!khmerSystemConfigured()) return { paid: false, error: "secret key not set" };
  if (!meta.verify_key) return { paid: false, error: "missing verify_key" };
  const telegram_user_id = String(meta.telegram_user_id || tgUserId());
  const qs = new URLSearchParams({
    secret_key: secretKey()!,
    verify_key: String(meta.verify_key),
    telegram_user_id,
  });
  try {
    const r = await fetch(`${payBase()}/api/v1/payment/check?${qs}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const data: any = await r.json().catch(() => ({}));
    const status = String(data.status || "").toLowerCase();
    const paid =
      status === "completed" ||
      status === "credit_confirmed" ||
      status === "paid" ||
      status === "success";
    return { paid, status, amount: data.amount != null ? Number(data.amount) : undefined, raw: data };
  } catch (e: any) {
    return { paid: false, error: e.message || String(e) };
  }
}
