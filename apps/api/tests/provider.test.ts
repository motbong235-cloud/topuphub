import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProviderStatus, pickProviderRef, pickProviderStatus } from "../src/modules/provider/normalize";

test("status normalisation", () => {
  for (const s of ["success", "COMPLETED", "Delivered"]) assert.equal(normalizeProviderStatus(s), "COMPLETED");
  for (const s of ["failed", "Cancelled", "refunded"]) assert.equal(normalizeProviderStatus(s), "FAILED");
  for (const s of ["processing", "in_progress"]) assert.equal(normalizeProviderStatus(s), "PROCESSING");
  for (const s of ["pending", "queued", "", undefined, "weird"]) assert.equal(normalizeProviderStatus(s as string), "PENDING"); // unknown never means success
});

test("reference + status extraction from different response shapes", () => {
  assert.equal(pickProviderRef({ order_code: "KT-1" }), "KT-1");
  assert.equal(pickProviderRef({ data: { id: 77 } }), "77");
  assert.equal(pickProviderRef({ order: { code: "X" } }), "X");
  assert.equal(pickProviderRef({ ok: true }), null);
  assert.equal(pickProviderStatus({ order: { status: "done" } }), "done");
});
