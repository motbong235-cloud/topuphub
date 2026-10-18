import rateLimit from "express-rate-limit";

const base = { standardHeaders: true, legacyHeaders: false } as const;
const msg = (m: string) => ({ error: { code: "RATE_LIMITED", message: m } });

export const authLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 20, message: msg("Too many attempts, slow down") });
export const apiLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 300, message: msg("Too many requests") });
export const webhookLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 240, message: msg("Too many requests") });
