import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { buildPurchaseFields, buildStatusRequest, interpretTransactionDetail, paywayReqTime } from "../src/modules/payments/payway.sign";

test("req_time is UTC YYYYMMDDHHmmss", () => {
  assert.equal(paywayReqTime(new Date(Date.UTC(2025, 6, 28, 2, 20, 56))), "20250728022056");
});

test("purchase hash follows the documented field order", () => {
  const f = buildPurchaseFields({
    merchantId: "ec000002", apiKey: "KEY", tranId: "17536691884", amount: "0.10", currency: "USD",
    items: [{ name: "Test", quantity: 1, price: "0.10" }],
    buyer: { firstname: "A", lastname: "B", email: "a@b.com", phone: "012345678" },
    pushbackUrl: "https://api.example.com/api/webhooks/payway", cancelUrl: "https://x.com/cancel", continueUrl: "https://x.com/ok",
    reqTime: "20250728022056",
  });
  const b4 =
    "20250728022056" + "ec000002" + "17536691884" + "0.10" + f.items + "0" + "" + "" +
    "A" + "B" + "a@b.com" + "012345678" + "purchase" + "" + f.return_url + "https://x.com/cancel" + "https://x.com/ok" + "" + "USD" + "" + "";
  assert.equal(f.hash, crypto.createHmac("sha512", "KEY").update(b4).digest("base64"));
  assert.equal(Buffer.from(f.return_url, "base64").toString(), "https://api.example.com/api/webhooks/payway");
  assert.deepEqual(JSON.parse(Buffer.from(f.items, "base64").toString()), [{ name: "Test", quantity: "1", price: "0.10" }]);
});

test("status request hash = base64(hmac_sha512(req_time + merchant_id + tran_id))", () => {
  const r = buildStatusRequest("ec000002", "KEY", "123", "20250213084236");
  assert.equal(r.hash, crypto.createHmac("sha512", "KEY").update("20250213084236ec000002123").digest("base64"));
});

test("transaction-detail interpretation", () => {
  assert.deepEqual(interpretTransactionDetail({ status: { code: "00" }, data: { payment_status: "APPROVED", original_amount: "1.50" } }), { paid: true, amount: 1.5 });
  assert.equal(interpretTransactionDetail({ status: { code: "00" }, data: { payment_status: "PENDING" } }).paid, false);
  assert.equal(interpretTransactionDetail({ status: { code: "05" }, data: { payment_status: "APPROVED" } }).paid, false);
  assert.equal(interpretTransactionDetail({}).paid, false);
});
