import { randomToken } from "../../lib/crypto";
import { logProvider } from "./providerLog";
import { ProviderRejectedError, type CreateOrderInput, type ProviderStatus, type TopupProvider } from "./types";

/** Local/sandbox adapter: succeeds after 2s. A target containing "fail" is rejected (to test refunds). */
export class MockTopupAdapter implements TopupProvider {
  readonly name = "mock";

  async createOrder(input: CreateOrderInput): Promise<{ providerRef: string; status: ProviderStatus }> {
    const started = Date.now();
    await new Promise((r) => setTimeout(r, 2000));
    if (input.target.toLowerCase().includes("fail")) {
      await logProvider({ provider: this.name, action: "create_order", requestBody: input, statusCode: 422, durationMs: Date.now() - started, error: "mock rejection" });
      throw new ProviderRejectedError("Mock provider rejected this target");
    }
    const providerRef = `MOCK-${randomToken(6).toUpperCase()}`;
    await logProvider({ provider: this.name, action: "create_order", requestBody: input, responseBody: { providerRef, status: "COMPLETED" }, statusCode: 200, durationMs: Date.now() - started });
    return { providerRef, status: "COMPLETED" };
  }

  async checkStatus(providerRef: string): Promise<{ status: ProviderStatus }> {
    await logProvider({ provider: this.name, action: "check_status", requestBody: { providerRef }, responseBody: { status: "COMPLETED" }, statusCode: 200, durationMs: 0 });
    return { status: "COMPLETED" };
  }
}
