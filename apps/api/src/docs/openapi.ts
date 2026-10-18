/** OpenAPI 3.0 description served by Swagger UI at /api/docs. */
export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "TopUpHub API",
    version: "1.0.0",
    description: [
      "Public reseller API: `https://topuphub.site/api/v1/reseller`.",
      "",
      "**Authentication (every request):** headers `X-API-KEY`, `X-TIMESTAMP` (unix seconds, +-5 min) and `X-SIGNATURE`.",
      "",
      "`X-SIGNATURE = hex(HMAC_SHA256(apiSecret, stringToSign))` where",
      "`stringToSign = timestamp + \"\\n\" + METHOD + \"\\n\" + pathWithQuery + \"\\n\" + sha256hex(rawBody)`",
      "(`pathWithQuery` is exactly what you request, e.g. `/api/v1/reseller/orders`; empty body = sha256 of empty string).",
      "",
      "`POST /orders` also requires `X-IDEMPOTENCY-KEY` (8-128 chars). Replaying the same key + body returns the original order (HTTP 200, `Idempotent-Replay: true`).",
      "",
      "**Webhooks:** we POST `{event, created_at, data}` to your webhook URL with `X-Webhook-Timestamp` and `X-Webhook-Signature = hex(HMAC_SHA256(webhookSecret, timestamp + \".\" + rawBody))`. Return 2xx; failures retry 5 times with exponential backoff.",
    ].join("\n"),
  },
  servers: [{ url: "/" }],
  tags: [{ name: "Reseller" }, { name: "Customer" }, { name: "Auth" }],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas: {
      Order: {
        type: "object",
        properties: {
          id: { type: "string" }, code: { type: "string" },
          status: { type: "string", enum: ["PENDING_PAYMENT", "PAID", "PROCESSING", "COMPLETED", "FAILED", "REFUNDED"] },
          target: { type: "string" }, server_id: { type: "string", nullable: true }, quantity: { type: "integer" },
          amount: { type: "string", example: "1.50" }, currency: { type: "string", example: "USD" },
          reference: { type: "string", nullable: true }, created_at: { type: "string", format: "date-time" },
        },
      },
      Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } } },
    },
  },
  paths: {
    "/api/v1/reseller/products": { get: { tags: ["Reseller"], summary: "List products with reseller prices", responses: { 200: { description: "OK" } } } },
    "/api/v1/reseller/balance": { get: { tags: ["Reseller"], summary: "Wallet balance", responses: { 200: { description: "OK" } } } },
    "/api/v1/reseller/orders": {
      post: {
        tags: ["Reseller"], summary: "Create an order (paid from wallet)",
        parameters: [{ name: "X-IDEMPOTENCY-KEY", in: "header", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["product", "target"], properties: { product: { type: "string", description: "product slug or id" }, target: { type: "string" }, server_id: { type: "string" }, quantity: { type: "integer", default: 1 }, reference: { type: "string" } } } } } },
        responses: { 201: { description: "Created" }, 200: { description: "Idempotent replay" }, 402: { description: "INSUFFICIENT_BALANCE" }, 409: { description: "IDEMPOTENCY_MISMATCH" } },
      },
      get: { tags: ["Reseller"], summary: "List recent orders", responses: { 200: { description: "OK" } } },
    },
    "/api/v1/reseller/orders/{id}": { get: { tags: ["Reseller"], summary: "Get an order (id, code or your reference)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" }, 404: { description: "Not found" } } } },
    "/api/v1/reseller/topup-wallet": { post: { tags: ["Reseller"], summary: "Start a wallet top-up (returns a PayWay checkout URL)", requestBody: { content: { "application/json": { schema: { type: "object", required: ["amount"], properties: { amount: { type: "number" } } } } } }, responses: { 201: { description: "Created" } } } },
    "/api/v1/reseller/transactions": { get: { tags: ["Reseller"], summary: "Wallet transactions", responses: { 200: { description: "OK" } } } },
    "/api/v1/reseller/webhook/test": { post: { tags: ["Reseller"], summary: "Send a signed test event to your webhook URL", responses: { 200: { description: "delivered" }, 502: { description: "delivery failed" } } } },
    "/api/auth/register": { post: { tags: ["Auth"], summary: "Register", responses: { 201: { description: "Created" } } } },
    "/api/auth/login": { post: { tags: ["Auth"], summary: "Login (returns JWT)", responses: { 200: { description: "OK" } } } },
    "/api/products": { get: { tags: ["Customer"], summary: "Public product catalog", responses: { 200: { description: "OK" } } } },
    "/api/payments/payway/create": { post: { tags: ["Customer"], summary: "Create an order + PayWay checkout", security: [{ bearer: [] }], responses: { 201: { description: "Returns checkoutUrl" } } } },
    "/api/payments/{code}/status": { get: { tags: ["Customer"], summary: "Payment/order status (poll fallback)", security: [{ bearer: [] }], parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" } } } },
    "/api/webhooks/payway": { post: { tags: ["Customer"], summary: "PayWay pushback (verified server-side)", responses: { 200: { description: "OK" } } } },
  },
} as const;
