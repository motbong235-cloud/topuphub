import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { AppError, unauthorized } from "../lib/errors";
import { decryptSecret, hmacHex, resellerStringToSign, safeEqual } from "../lib/crypto";

const MAX_SKEW_SECONDS = 300;

/**
 * Reseller API authentication:
 *   X-API-KEY, X-TIMESTAMP (unix seconds, +-5 min), X-SIGNATURE = HMAC-SHA256(secret, stringToSign)
 * plus a per-reseller rate limit (requests per minute, Redis counter) and an ApiLog row per request.
 */
export function resellerAuth(req: Request, res: Response, next: NextFunction) {
  (async () => {
    const key = String(req.header("x-api-key") ?? "");
    const ts = String(req.header("x-timestamp") ?? "");
    const sig = String(req.header("x-signature") ?? "").toLowerCase();
    if (!key || !ts || !sig) throw unauthorized("Missing X-API-KEY / X-TIMESTAMP / X-SIGNATURE", "MISSING_AUTH_HEADERS");

    const reseller = await prisma.reseller.findUnique({ where: { apiKey: key } });
    if (!reseller || !reseller.active) throw unauthorized("Invalid API key", "INVALID_API_KEY");

    const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
    if (!Number.isFinite(skew) || skew > MAX_SKEW_SECONDS) throw unauthorized("Timestamp outside the allowed window", "STALE_TIMESTAMP");

    const secret = decryptSecret(reseller.apiSecretEnc, env.SECRETS_KEY);
    const expected = hmacHex(secret, resellerStringToSign(ts, req.method, req.originalUrl, req.rawBody ?? ""));
    if (!safeEqual(expected, sig)) throw unauthorized("Invalid signature", "INVALID_SIGNATURE");

    const bucket = `rl:${reseller.id}:${Math.floor(Date.now() / 60_000)}`;
    const count = await redis.incr(bucket);
    if (count === 1) await redis.expire(bucket, 70);
    res.setHeader("X-RateLimit-Limit", String(reseller.rateLimitPerMin));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, reseller.rateLimitPerMin - count)));
    if (count > reseller.rateLimitPerMin) {
      res.setHeader("Retry-After", "60");
      throw new AppError(429, "RATE_LIMITED", "Too many requests");
    }

    const started = Date.now();
    res.on("finish", () => {
      prisma.apiLog
        .create({ data: { resellerId: reseller.id, method: req.method, path: req.originalUrl.slice(0, 300), statusCode: res.statusCode, ip: req.ip, durationMs: Date.now() - started } })
        .catch(() => undefined);
    });

    req.reseller = reseller;
    next();
  })().catch(next);
}

/** POST endpoints that create things must carry X-IDEMPOTENCY-KEY. */
export function requireIdempotencyKey(req: Request): string {
  const k = String(req.header("x-idempotency-key") ?? "");
  if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(k)) {
    throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "X-IDEMPOTENCY-KEY header (8-128 chars: letters, digits, _ . : -) is required");
  }
  return k;
}
