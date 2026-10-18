import type { ProviderStatus } from "./types";

const DONE = ["success", "succeeded", "completed", "complete", "done", "delivered", "paid", "fulfilled", "ok"];
const FAIL = ["failed", "fail", "error", "cancelled", "canceled", "rejected", "refunded", "declined"];
const BUSY = ["processing", "in_progress", "in-progress", "handling", "running"];

/** Map whatever the provider returns onto our 4 states. Unknown values stay PENDING (keep polling). */
export function normalizeProviderStatus(raw: unknown): ProviderStatus {
  const s = String(raw ?? "").trim().toLowerCase();
  if (DONE.includes(s)) return "COMPLETED";
  if (FAIL.includes(s)) return "FAILED";
  if (BUSY.includes(s)) return "PROCESSING";
  return "PENDING";
}

/** Best-effort extraction of the provider's order reference from different response shapes. */
export function pickProviderRef(data: any): string | null {
  const c = [
    data?.order_code, data?.code, data?.reference_code,
    data?.order?.order_code, data?.order?.code, data?.order?.id,
    data?.data?.order_code, data?.data?.code, data?.data?.id,
    data?.id,
  ];
  const v = c.find((x) => x !== undefined && x !== null && String(x).length > 0);
  return v === undefined ? null : String(v);
}

export function pickProviderStatus(data: any): unknown {
  return data?.status ?? data?.order?.status ?? data?.data?.status ?? data?.state;
}
