export type ProviderStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface CreateOrderInput {
  productCode: string;
  target: string; // game UID / phone number
  serverId?: string;
  quantity: number;
  requestId: string; // idempotency: our order code
}

export interface TopupProvider {
  readonly name: string;
  createOrder(input: CreateOrderInput): Promise<{ providerRef: string; status: ProviderStatus }>;
  checkStatus(providerRef: string): Promise<{ status: ProviderStatus }>;
}

/** Provider definitively refused the order (4xx): refund, never retry. */
export class ProviderRejectedError extends Error {}
/** Safe to retry (5xx / 429 / not configured yet). */
export class ProviderTransientError extends Error {}
/**
 * The request may or may not have been accepted (timeout / network error / no reference returned).
 * Never retry blindly (risk of double delivery): flag the order for manual review.
 */
export class ProviderAmbiguousError extends Error {}
