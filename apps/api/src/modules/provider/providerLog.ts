import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";

const SECRET_KEY = /(authorization|api[-_]?key|secret|token|password|signature)/i;

export function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, SECRET_KEY.test(k) ? "[redacted]" : redact(val)]),
    );
  }
  return v;
}

export async function logProvider(row: {
  provider: string;
  action: "create_order" | "check_status";
  requestBody: unknown;
  responseBody?: unknown;
  statusCode?: number;
  durationMs: number;
  error?: string;
}) {
  try {
    await prisma.providerLog.create({
      data: {
        provider: row.provider,
        action: row.action,
        requestBody: redact(row.requestBody ?? {}) as Prisma.InputJsonValue,
        responseBody: row.responseBody === undefined ? undefined : (redact(row.responseBody) as Prisma.InputJsonValue),
        statusCode: row.statusCode,
        durationMs: row.durationMs,
        error: row.error?.slice(0, 500),
      },
    });
  } catch (e) {
    logger.warn("provider log write failed", { err: String(e) }); // logging must never break an order
  }
}
