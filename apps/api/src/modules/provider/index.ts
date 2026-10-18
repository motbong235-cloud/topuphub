import { env } from "../../config/env";
import { KhmerTopupAdapter } from "./khmerTopup.adapter";
import { MockTopupAdapter } from "./mock.adapter";
import type { TopupProvider } from "./types";

let instance: TopupProvider | null = null;

/** Provider factory. Controllers never talk to a provider directly; the order worker calls this. */
export function getProvider(): TopupProvider {
  if (!instance) {
    instance =
      env.TOPUP_PROVIDER_RESOLVED === "mock"
        ? new MockTopupAdapter()
        : new KhmerTopupAdapter({
            baseUrl: env.KHMER_TOPUP_BASE_URL.replace(/\/+$/, ""),
            apiKey: env.KHMER_TOPUP_API_KEY,
            secret: env.KHMER_TOPUP_SECRET,
          });
  }
  return instance;
}
