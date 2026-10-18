import "dotenv/config";
import { z } from "zod";

const bool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  SECRETS_KEY: z.string().min(16, "SECRETS_KEY must be at least 16 chars"), // encrypts reseller secrets at rest
  WEBHOOK_SECRET: z.string().min(16),
  APP_URL: z.string().url().default("http://localhost:3000"), // public web app (checkout page / return URLs)
  API_URL: z.string().url().default("http://localhost:4000"), // public API (PayWay pushback)
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // Top-up provider
  TOPUP_PROVIDER: z.enum(["khmer_topup", "mock"]).optional(),
  KHMER_TOPUP_BASE_URL: z.string().url().default("https://khmer-topup.com/api/v1"),
  KHMER_TOPUP_API_KEY: z.string().optional(),
  KHMER_TOPUP_SECRET: z.string().optional(),

  // PayWay
  PAYWAY_MERCHANT_ID: z.string().optional(),
  PAYWAY_API_KEY: z.string().optional(),
  PAYWAY_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  PAYWAY_BASE_URL: z.string().url().optional(),
  PAYMENT_SIMULATION: bool.default("false"),

  START_WORKER: bool.default("true"),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:\n", JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}
const e = parsed.data;

// Mock provider: TOPUP_PROVIDER=mock, or development with nothing configured.
const topupProvider: "khmer_topup" | "mock" =
  e.TOPUP_PROVIDER === "mock" || (e.NODE_ENV === "development" && !e.TOPUP_PROVIDER) ? "mock" : "khmer_topup";

const paywayBase =
  e.PAYWAY_BASE_URL ??
  (e.PAYWAY_ENV === "production" ? "https://checkout.payway.com.kh" : "https://checkout-sandbox.payway.com.kh");

export const env = { ...e, TOPUP_PROVIDER_RESOLVED: topupProvider, PAYWAY_BASE: paywayBase.replace(/\/+$/, "") };
export const isProd = env.NODE_ENV === "production";

if (isProd && env.PAYMENT_SIMULATION) {
  console.error("PAYMENT_SIMULATION=true is not allowed when NODE_ENV=production (it would fake payments).");
  process.exit(1);
}
if (isProd && topupProvider === "mock") {
  console.warn("[warn] TOPUP_PROVIDER=mock in production: orders will be marked COMPLETED without delivering anything.");
}
