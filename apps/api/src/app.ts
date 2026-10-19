import express, { type Request } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { redis } from "./lib/redis";
import { openapi } from "./docs/openapi";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { apiLimiter } from "./middleware/rateLimit";
import { authRouter } from "./modules/auth/auth.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { ordersRouter } from "./modules/orders/orders.routes";
import { paymentsRouter, webhooksRouter } from "./modules/payments/payments.routes";
import { resellerApiRouter } from "./modules/reseller/reseller.routes";
import { portalRouter } from "./modules/reseller/portal.routes";
import { adminRouter } from "./modules/admin/admin.routes";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1); // Render terminates TLS: req.ip = real client IP

  // Swagger UI needs inline scripts, so it is mounted before helmet's strict CSP.
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi as any));

  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // API only; CSP is for the web app
  }));
  const corsOrigins = env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, cb) => {
      // allow same-origin tools (no Origin) and configured web hosts
      if (!origin || corsOrigins.includes(origin) || corsOrigins.includes("*")) return cb(null, true);
      // also allow *.onrender.com web previews during setup
      if (/^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-API-KEY", "X-TIMESTAMP", "X-SIGNATURE", "X-IDEMPOTENCY-KEY"],
  }));
  // Keep the raw bytes: the reseller HMAC signature covers the exact request body.
  app.use(express.json({ limit: "1mb", verify: (req, _res, buf) => { (req as Request).rawBody = buf; } }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.json({
      name: "TopUpHub API",
      ok: true,
      docs: "/api/docs",
      health: "/health",
      auth: "/api/auth/register",
      products: "/api/products",
    });
  });

  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await redis.ping();
      res.json({ ok: true });
    } catch (e) {
      res.status(503).json({ ok: false, error: String(e) });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/products", apiLimiter, catalogRouter);
  app.use("/api/orders", apiLimiter, ordersRouter);
  app.use("/api/payments", apiLimiter, paymentsRouter);
  app.use("/api/webhooks", webhooksRouter);
  app.use("/api/v1/reseller", resellerApiRouter);
  app.use("/api/reseller-portal", apiLimiter, portalRouter);
  app.use("/api/admin", apiLimiter, adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
