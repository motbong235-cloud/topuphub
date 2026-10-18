import dns from "dns/promises";
import net from "net";
import { badRequest } from "./errors";

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
}

/** Webhook URLs are reseller-controlled, so internal targets must be blocked (SSRF). */
export async function assertSafeWebhookUrl(raw: string, allowHttp = false): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw badRequest("Invalid webhook URL", "INVALID_WEBHOOK_URL");
  }
  if (u.protocol !== "https:" && !(allowHttp && u.protocol === "http:")) {
    throw badRequest("Webhook URL must use https", "INVALID_WEBHOOK_URL");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw badRequest("Webhook host not allowed", "INVALID_WEBHOOK_URL");
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw badRequest("Webhook host does not resolve", "INVALID_WEBHOOK_URL");
  if (addrs.some((a) => isPrivateIp(a.address))) throw badRequest("Webhook host not allowed", "INVALID_WEBHOOK_URL");
  return u;
}
