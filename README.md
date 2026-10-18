# TopUpHub

Top-up & digital services platform with a public **Reseller API**.

* **Top-up provider:** Khmer Topup (behind a swappable adapter) · **Payments:** ABA PayWay (hosted checkout)
* **Backend:** Node 20 · Express · TypeScript · Prisma 5 · PostgreSQL 16 · Redis + BullMQ
* **Frontend:** Next.js 14 (App Router) · Tailwind · shadcn-style components · KH + EN
* **Docs:** Swagger UI at `/api/docs`

```
apps/api   Express API, Prisma schema, BullMQ workers, tests
apps/web   Next.js storefront, reseller dashboard, admin panel
render.yaml · Dockerfile · docker-compose.yml (local Postgres + Redis)
```

## Integrations

| Service | Env | Purpose |
|---------|-----|---------|
| **Khmer TopUp** | `KHMER_TOPUP_API_KEY` | Auto game top-up delivery |
| **Khmer System** | `KHMER_SYSTEM_SECRET_KEY` or `ABA_API_KEY` | KHQR payment |
| **ABA PayWay** | `PAYWAY_MERCHANT_ID` + `PAYWAY_API_KEY` | Hosted checkout |
| Gateway select | `PAYMENT_GATEWAY=auto\|payway\|khmer_system` | Prefer KS when key set |

What is verified and what is not (read this first)

| Area | Status |
|---|---|
| HMAC signing, AES secret storage, idempotency logic, PayWay hash, SSRF guard, status mapping | Unit-tested (`npm test` in `apps/api`, 9 tests pass) |
| PayWay hosted-checkout request + hash field order, `transaction-detail` hash | Implemented from the official docs (developer.payway.com.kh). **Not tested against a live sandbox.** |
| PayWay `transaction-detail` *response* fields (`status.code`, `data.payment_status`, amount) | Read defensively; **confirm in sandbox** and adjust `interpretTransactionDetail` in `payway.sign.ts` if needed |
| Khmer Topup request/response shapes | Request shape copied from the client already used in the Nexa project (`POST /orders`, `GET /orders/{code}`, Bearer + X-API-Key). Response mapping is defensive. **Confirm with their docs/sandbox** (`modules/provider/normalize.ts`) |
| Prisma migrations, `tsc`, `next build` | Not run in the authoring environment (no network). Run the steps below once. |

Deviations from the original brief, on purpose:
* **PayWay SDK:** I could not verify that `aba-payway-sdk` exists, so PayWay is called directly (the signing is ~40 lines, see `payway.sign.ts`).
* **PayWay URLs:** the docs use `checkout-sandbox.payway.com.kh` / `checkout.payway.com.kh`, not `api.payway.com.kh`.
* **Pushback is never trusted.** The webhook only extracts `tran_id`, then asks PayWay (`transaction-detail`), compares the amount, and settles idempotently. A reconciler runs every 60 s as a second safety net.
* **render.yaml:** Postgres is a managed `databases:` entry and Redis a `redis` service (not `pserv`).
* `bcryptjs` instead of `bcrypt` (no native build step on Render).

## Local setup

```bash
docker compose up -d                    # Postgres 16 + Redis 7

cd apps/api
cp .env.example .env                    # defaults: TOPUP_PROVIDER=mock, PAYMENT_SIMULATION=true
npm install
npx prisma migrate dev --name init      # creates prisma/migrations  -> COMMIT this folder
ADMIN_PASSWORD='choose-a-password' npm run seed
npm run dev                             # API on :4000, workers included
npm test

cd ../web
cp .env.example .env.local
npm install
npm run dev                             # http://localhost:3000
```

> **Commit `apps/api/prisma/migrations/`.** Render runs `prisma migrate deploy`, which does nothing (tables missing) if the folder does not exist.

Try it: register → open a product → *Pay with PayWay* → with `PAYMENT_SIMULATION=true` you get a "simulate payment" button → the order is processed by the mock provider (2 s). A target containing `fail` makes the mock provider reject, so you can watch the refund path.

## PayWay (ABA)

1. Register a sandbox merchant: <https://sandbox.payway.com.kh/register-sandbox/>. Docs: <https://developer.payway.com.kh>.
2. Put `PAYWAY_MERCHANT_ID` and `PAYWAY_API_KEY` in the env, `PAYWAY_ENV=sandbox`, `PAYMENT_SIMULATION=false`.
3. In the PayWay merchant settings the pushback (callback) URL is sent per request as `return_url` = `${API_URL}/api/webhooks/payway`; `API_URL` must be publicly reachable (use a tunnel such as ngrok locally).
4. Flow: `POST /api/payments/payway/create` → `/pay/{tranId}` (our page auto-POSTs the signed form to PayWay's hosted checkout: ABA PAY, KHQR/QR, cards) → customer pays → pushback → verify with `transaction-detail` → order `PAID` → BullMQ `process-order`.
5. **Production:** PayWay requires your server IPs and domains to be whitelisted and production credentials issued by ABA. Ask your ABA relationship manager to whitelist the Render outbound IPs and `topuphub.site`, then set `PAYWAY_ENV=production`. (`PAYMENT_SIMULATION=true` is refused in production.)
6. Refunds: automatic for **reseller wallet** orders. For **web** orders the system creates a `REFUND` transaction in `PENDING`; refund in the PayWay dashboard (or implement PayWay's Refund API, which needs a merchant-auth value from ABA) and click *Mark refunded* in Admin → transactions.

## Khmer Topup

1. Create an account at khmer-topup.com and generate a reseller API key (docs: <https://khmer-topup.com/api-docs>).
2. Set `KHMER_TOPUP_API_KEY` (and `KHMER_TOPUP_SECRET` only if the provider requires signed requests; then `X-Timestamp`/`X-Signature` are added).
3. For each product set **providerCode** = Khmer Topup *package id* (Admin → products).
4. **Switch provider:** `TOPUP_PROVIDER=mock` or `khmer_topup`. Controllers never call a provider; only the `process-order` worker does, via `getProvider()`. Every outbound call is stored in `ProviderLog` (secrets redacted).
5. If their API differs, change only `modules/provider/khmerTopup.adapter.ts` + `normalize.ts`.

Delivery safety rules implemented in the worker:
* HTTP 4xx from the provider → refund immediately (no retry).
* 5xx / 429 → retry 3× with exponential backoff, then refund.
* Timeout or "accepted but no reference" → **never retried** (could double-deliver). The order gets `needsReview`; resolve it in Admin → orders (*Delivered* / *Fail + refund* / *Retry*).
* Pending at the provider → polled every 10 s for 5 minutes, then flagged for review.

## Reseller API

Base URL `https://topuphub.site/api/v1/reseller` (your API host). Auth headers on **every** request:

| Header | Value |
|---|---|
| `X-API-KEY` | your key (`pk_…`) |
| `X-TIMESTAMP` | unix seconds (±5 min) |
| `X-SIGNATURE` | `hex(HMAC_SHA256(secret, TS "\n" METHOD "\n" PATH "\n" sha256hex(rawBody)))` |
| `X-IDEMPOTENCY-KEY` | required on `POST /orders` (8–128 chars) |

`PATH` is the path + query exactly as requested, e.g. `/api/v1/reseller/orders`. Empty body → sha256 of the empty string.

```bash
KEY="pk_xxx"; SECRET="sk_xxx"; HOST="https://topuphub-api.onrender.com"
BODY='{"product":"mlbb-86","target":"123456789","server_id":"1234","reference":"my-order-1"}'
TS=$(date +%s)
BODY_SHA=$(printf '%s' "$BODY" | openssl dgst -sha256 -hex | awk '{print $2}')
SIG=$(printf '%s\n%s\n%s\n%s' "$TS" "POST" "/api/v1/reseller/orders" "$BODY_SHA" \
  | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')

curl -X POST "$HOST/api/v1/reseller/orders" -H "Content-Type: application/json" \
  -H "X-API-KEY: $KEY" -H "X-TIMESTAMP: $TS" -H "X-SIGNATURE: $SIG" \
  -H "X-IDEMPOTENCY-KEY: order-$(date +%s%N)" -d "$BODY"
```

For GET requests use `BODY=''`. (This recipe was checked to produce the same signature as the server code.)

| Endpoint | |
|---|---|
| `GET /products` | catalog with reseller prices |
| `GET /balance` | wallet balance |
| `POST /orders` | create + pay from wallet (atomic debit; same idempotency key + body → original order, HTTP 200 `Idempotent-Replay: true`; different body → 409) |
| `GET /orders/{id}` | by id, code or your `reference` |
| `GET /orders` | recent orders |
| `POST /topup-wallet` `{amount}` | returns a PayWay `checkout_url`; credited after verified payment |
| `GET /transactions` | wallet ledger |
| `POST /webhook/test` | sends a signed test event |

Errors: `{ "error": { "code": "INSUFFICIENT_BALANCE", "message": "…" } }`.

**Webhooks** (`order.completed`, `order.failed`, `order.refunded`): JSON `{event, created_at, data}` with `X-Webhook-Timestamp` and `X-Webhook-Signature = hex(HMAC_SHA256(webhookSecret, timestamp + "." + rawBody))`. Return 2xx; failures retry 5× (10 s, 20 s, 40 s, 80 s). Verify the signature and reject old timestamps. Webhook URLs must be `https` and must not resolve to private addresses (SSRF guard).

Becoming a reseller: the user registers, then an admin creates the reseller (Admin → resellers); the API secret is shown **once** (rotate any time in the dashboard).

## Deploy on Render

1. Push this repo to GitHub, **including `apps/api/prisma/migrations`**.
2. Render → New → Blueprint → select the repo. Adjust plan names in `render.yaml` if your account uses different ones.
3. Fill the `sync: false` variables: `KHMER_TOPUP_API_KEY`, `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `APP_URL`, `API_URL`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`.
4. After the first deploy, open the API **Shell** and run `ADMIN_PASSWORD='…' npm run seed` (creates the admin and example products — edit/replace them in Admin).
5. Point `topuphub.site` at the web service and the API domain at the API service; update `APP_URL`/`API_URL`/`CORS_ORIGIN`/`NEXT_PUBLIC_API_URL` and redeploy the web service.
6. Never change or lose `SECRETS_KEY` (it encrypts reseller secrets).

Docker alternative: `docker build --target api -t topuphub-api .` and `docker build --target web --build-arg NEXT_PUBLIC_API_URL=https://… -t topuphub-web .`

## Security notes

* Reseller secrets are AES-256-GCM encrypted at rest and shown once; signatures are compared in constant time with a ±5 min window.
* The admin role is re-read from the database on every request; login/registration are rate-limited; reseller API has a per-key per-minute limit.
* The customer JWT is kept in `localStorage` (simple SPA flow). If you add user-generated HTML, move to httpOnly cookies.
* Rotate any credential that was ever pasted into a chat or committed.

## Known limits / next steps

* PayWay refunds for web orders are manual (see above).
* Guest checkout is not implemented (customers register first).
* No email/SMS notifications; add them in `completeOrder` / `failOrder`.
* Add integration tests against the PayWay sandbox and the Khmer Topup sandbox before going live.
