import crypto from "crypto";

export const sha256hex = (d: string | Buffer) => crypto.createHash("sha256").update(d).digest("hex");
export const hmacHex = (secret: string, data: string) => crypto.createHmac("sha256", secret).update(data).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const A = Buffer.from(a, "utf8");
  const B = Buffer.from(b, "utf8");
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

const keyFrom = (s: string) => crypto.createHash("sha256").update(s).digest();

/** AES-256-GCM. Returns "iv.tag.ciphertext" (base64 parts). */
export function encryptSecret(plain: string, masterKey: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyFrom(masterKey), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string, masterKey: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", keyFrom(masterKey), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString("hex");

/**
 * Reseller request signature:
 *   stringToSign = `${timestamp}\n${METHOD}\n${path+query}\n${sha256hex(rawBody)}`
 *   signature    = HMAC-SHA256(apiSecret, stringToSign)   (hex)
 */
export function resellerStringToSign(ts: string, method: string, pathWithQuery: string, rawBody: Buffer | string) {
  return `${ts}\n${method.toUpperCase()}\n${pathWithQuery}\n${sha256hex(rawBody)}`;
}
