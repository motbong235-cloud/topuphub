-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'RESELLER', 'ADMIN');
CREATE TYPE "OrderSource" AS ENUM ('WEB', 'RESELLER');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED');
CREATE TYPE "TxType" AS ENUM ('PAYMENT', 'WALLET_TOPUP', 'ORDER_DEBIT', 'REFUND');
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "locale" TEXT NOT NULL DEFAULT 'km',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reseller" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecretEnc" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "webhookUrl" TEXT,
    "webhookSecretEnc" TEXT NOT NULL,
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 60,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reseller_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'game',
    "imageUrl" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "resellerPrice" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "providerCode" TEXT NOT NULL,
    "providerName" TEXT NOT NULL DEFAULT 'khmer_topup',
    "requiresServer" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT,
    "resellerId" TEXT,
    "productId" TEXT NOT NULL,
    "source" "OrderSource" NOT NULL,
    "target" TEXT NOT NULL,
    "serverId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "providerRef" TEXT,
    "paymentRef" TEXT,
    "idempotencyKey" TEXT,
    "resellerRef" TEXT,
    "failReason" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "userId" TEXT,
    "resellerId" TEXT,
    "type" "TxType" NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'PENDING',
    "gateway" TEXT NOT NULL,
    "gatewayTranId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "note" TEXT,
    "pushbackRaw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiLog" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "ip" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT,
    "orderId" TEXT,
    "direction" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "url" TEXT,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "requestBody" JSONB NOT NULL,
    "responseBody" JSONB,
    "statusCode" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Reseller_userId_key" ON "Reseller"("userId");
CREATE UNIQUE INDEX "Reseller_apiKey_key" ON "Reseller"("apiKey");
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");
CREATE UNIQUE INDEX "Order_resellerId_idempotencyKey_key" ON "Order"("resellerId", "idempotencyKey");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE UNIQUE INDEX "Transaction_gatewayTranId_key" ON "Transaction"("gatewayTranId");
CREATE INDEX "Transaction_resellerId_idx" ON "Transaction"("resellerId");
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX "ApiLog_resellerId_createdAt_idx" ON "ApiLog"("resellerId", "createdAt");
CREATE INDEX "WebhookLog_resellerId_createdAt_idx" ON "WebhookLog"("resellerId", "createdAt");
CREATE INDEX "ProviderLog_createdAt_idx" ON "ProviderLog"("createdAt");

ALTER TABLE "Reseller" ADD CONSTRAINT "Reseller_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApiLog" ADD CONSTRAINT "ApiLog_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE SET NULL ON UPDATE CASCADE;
