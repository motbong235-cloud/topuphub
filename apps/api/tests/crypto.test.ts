import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, hmacHex, resellerStringToSign, safeEqual, sha256hex } from "../src/lib/crypto";
import { isPrivateIp } from "../src/lib/ssrf";

test("AES-256-GCM round trip + tamper detection", () => {
  const enc = encryptSecret("sk_super_secret", "master-key-master-key");
  assert.equal(decryptSecret(enc, "master-key-master-key"), "sk_super_secret");
  assert.notEqual(enc, encryptSecret("sk_super_secret", "master-key-master-key")); // random IV
  assert.throws(() => decryptSecret(enc, "another-key-another-key"));
  const [iv, tag, data] = enc.split(".");
  const flipped = Buffer.from(data, "base64");
  flipped[0] ^= 1;
  assert.throws(() => decryptSecret([iv, tag, flipped.toString("base64")].join("."), "master-key-master-key"));
});

test("reseller signature is deterministic and body-bound", () => {
  const body = JSON.stringify({ product: "mlbb-86", target: "12345" });
  const s1 = hmacHex("sk_test", resellerStringToSign("1700000000", "post", "/api/v1/reseller/orders", body));
  const s2 = hmacHex("sk_test", resellerStringToSign("1700000000", "POST", "/api/v1/reseller/orders", body));
  assert.equal(s1, s2); // method is case-insensitive
  assert.match(s1, /^[0-9a-f]{64}$/);
  const tampered = hmacHex("sk_test", resellerStringToSign("1700000000", "POST", "/api/v1/reseller/orders", body.replace("12345", "99999")));
  assert.notEqual(s1, tampered);
  assert.equal(resellerStringToSign("1", "GET", "/x", ""), `1\nGET\n/x\n${sha256hex("")}`);
  assert.ok(safeEqual(s1, s2));
  assert.ok(!safeEqual(s1, tampered));
});

test("SSRF private ranges", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.5", "172.16.0.1", "172.31.255.255", "169.254.169.254", "100.64.0.1", "::1", "fd00::1"]) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1"]) assert.ok(!isPrivateIp(ip), ip);
});
