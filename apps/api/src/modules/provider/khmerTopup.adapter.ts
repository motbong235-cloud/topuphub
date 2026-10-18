import { hmacHex } from "../../lib/crypto";
import { logProvider } from "./providerLog";
import { normalizeProviderStatus, pickProviderRef, pickProviderStatus } from "./normalize";
import {
  ProviderAmbiguousError, ProviderRejectedError, ProviderTransientError,
  type CreateOrderInput, type ProviderStatus, type TopupProvider,
} from "./types";

export interface KhmerTopupConfig {
  baseUrl: string;
  apiKey?: string;
  secret?: string; // optional: adds X-Timestamp / X-Signature (HMAC-SHA256) headers
}

/**
 * Khmer Topup reseller API adapter.
 * Request shape follows the client already used in the Nexa project:
 *   POST {base}/orders        { package_id, player_id, server_id?, reference }
 *   GET  {base}/orders/{code}
 *   auth: Authorization: Bearer <key> + X-API-Key
 * NOTE: response field names are mapped defensively (see normalize.ts). Verify against the real docs
 * (https://khmer-topup.com/api-docs) before going live.
 */
export class KhmerTopupAdapter implements TopupProvider {
  readonly name = "khmer_topup";
  constructor(private cfg: KhmerTopupConfig) {}

  private async call(action: "create_order" | "check_status", method: "GET" | "POST", path: string, body?: unknown) {
    if (!this.cfg.apiKey) throw new ProviderTransientError("KHMER_TOPUP_API_KEY is not configured");
    const raw = body === undefined ? "" : JSON.stringify(body);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.apiKey}`,
      "X-API-Key": this.cfg.apiKey,
      Accept: "application/json",
    };
    if (raw) headers["Content-Type"] = "application/json";
    if (this.cfg.secret) {
      const ts = String(Math.floor(Date.now() / 1000));
      headers["X-Timestamp"] = ts;
      headers["X-Signature"] = hmacHex(this.cfg.secret, `${ts}.${raw}`);
    }

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl}${path}`, { method, headers, body: raw || undefined, signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      await logProvider({ provider: this.name, action, requestBody: body ?? { path }, durationMs: Date.now() - started, error: String(e) });
      // A timed-out POST may still have created the order -> ambiguous. A GET is always safe to retry.
      if (method === "POST") throw new ProviderAmbiguousError(`Provider request failed: ${String(e)}`);
      throw new ProviderTransientError(`Provider request failed: ${String(e)}`);
    }
    const data: any = await res.json().catch(() => ({}));
    await logProvider({
      provider: this.name, action, requestBody: body ?? { path }, responseBody: data,
      statusCode: res.status, durationMs: Date.now() - started,
    });
    if (!res.ok) {
      const msg = String(data?.error ?? data?.message ?? `HTTP ${res.status}`);
      if (res.status === 408 || res.status === 429 || res.status >= 500) throw new ProviderTransientError(msg);
      throw new ProviderRejectedError(msg);
    }
    return data;
  }

  async createOrder(input: CreateOrderInput): Promise<{ providerRef: string; status: ProviderStatus }> {
    const body: Record<string, unknown> = {
      package_id: /^\d+$/.test(input.productCode) ? Number(input.productCode) : input.productCode,
      player_id: input.target,
      reference: input.requestId, // lets the provider de-duplicate retries
    };
    if (input.serverId) body.server_id = input.serverId;
    if (input.quantity > 1) body.quantity = input.quantity;

    const data = await this.call("create_order", "POST", "/orders", body);
    const providerRef = pickProviderRef(data);
    // Accepted but we cannot tell which order it is -> never retry, a human must check.
    if (!providerRef) throw new ProviderAmbiguousError("Provider accepted the order but returned no reference");
    return { providerRef, status: normalizeProviderStatus(pickProviderStatus(data)) };
  }

  async checkStatus(providerRef: string): Promise<{ status: ProviderStatus }> {
    const data = await this.call("check_status", "GET", `/orders/${encodeURIComponent(providerRef)}`);
    return { status: normalizeProviderStatus(pickProviderStatus(data)) };
  }
}
