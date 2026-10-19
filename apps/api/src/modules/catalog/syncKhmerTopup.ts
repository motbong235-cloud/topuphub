import { Prisma } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";

const d = (n: number) => new Prisma.Decimal(Number(n).toFixed(2));

function slugify(s: string) {
  return String(s || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "item";
}

/** Markup % on supplier price → retail price */
function retailPrice(cost: number) {
  const pct = Number(process.env.CATALOG_MARKUP_PERCENT || process.env.RESELLER_MARKUP_PERCENT || 12);
  return Math.max(0.01, Math.round(cost * (1 + pct / 100) * 100) / 100);
}

function resellerPrice(cost: number) {
  const pct = Number(process.env.RESELLER_MARKUP_PERCENT || 5);
  return Math.max(0.01, Math.round(cost * (1 + pct / 100) * 100) / 100);
}

/**
 * Pull live catalogue from Khmer TopUp and upsert products.
 * Docs: GET /api/v1/games  (or /games relative to base)
 */
export async function syncKhmerTopupCatalog(): Promise<{
  ok: boolean;
  created: number;
  updated: number;
  total: number;
  error?: string;
}> {
  const apiKey = env.KHMER_TOPUP_API_KEY;
  if (!apiKey) {
    return { ok: false, created: 0, updated: 0, total: 0, error: "KHMER_TOPUP_API_KEY is not set" };
  }
  const base = env.KHMER_TOPUP_BASE_URL.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "X-API-Key": apiKey,
    Accept: "application/json",
  };
  if (env.KHMER_TOPUP_SECRET) {
    // optional — most accounts only need API key
  }

  let data: any;
  try {
    const r = await fetch(`${base}/games`, { headers, signal: AbortSignal.timeout(30_000) });
    data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return {
        ok: false,
        created: 0,
        updated: 0,
        total: 0,
        error: data?.error || data?.message || `HTTP ${r.status}`,
      };
    }
  } catch (e: any) {
    return { ok: false, created: 0, updated: 0, total: 0, error: e.message || String(e) };
  }

  const games = data.games || data.data || data || [];
  if (!Array.isArray(games)) {
    return { ok: false, created: 0, updated: 0, total: 0, error: "Unexpected response (no games array)" };
  }

  let created = 0;
  let updated = 0;
  let sort = 0;

  for (const g of games) {
    const gameName = String(g.name || g.title || g.slug || "Game");
    const gameSlug = slugify(g.slug || g.id || gameName);
    const needsServer = Boolean(g.server_label || g.serverLabel || g.requires_server);
    const packs = g.packages || g.packs || g.items || [];
    if (!Array.isArray(packs)) continue;

    for (const pk of packs) {
      const packageId = pk.package_id ?? pk.packageId ?? pk.id ?? pk.code;
      if (packageId == null || packageId === "") continue;
      const packName = String(pk.name || pk.title || `Pack ${packageId}`);
      const cost = Number(pk.price ?? pk.cost ?? pk.amount ?? 0);
      if (!(cost > 0)) continue;

      const slug = slugify(`${gameSlug}-${packageId}-${packName}`).slice(0, 100);
      const name = `${gameName} · ${packName}`;
      const price = retailPrice(cost);
      const rprice = resellerPrice(cost);
      const providerCode = String(packageId);

      const existing = await prisma.product.findUnique({ where: { slug } });
      if (existing) {
        await prisma.product.update({
          where: { slug },
          data: {
            name,
            description: packName,
            category: gameSlug,
            price: d(price),
            resellerPrice: d(rprice),
            providerCode,
            providerName: "khmer_topup",
            requiresServer: needsServer,
            active: true,
            sort: sort++,
          },
        });
        updated++;
      } else {
        // also match by providerCode to avoid duplicates on slug change
        const byCode = await prisma.product.findFirst({
          where: { providerCode, providerName: "khmer_topup" },
        });
        if (byCode) {
          await prisma.product.update({
            where: { id: byCode.id },
            data: {
              name,
              description: packName,
              category: gameSlug,
              price: d(price),
              resellerPrice: d(rprice),
              requiresServer: needsServer,
              active: true,
              sort: sort++,
            },
          });
          updated++;
        } else {
          await prisma.product.create({
            data: {
              slug,
              name,
              description: packName,
              category: gameSlug,
              price: d(price),
              resellerPrice: d(rprice),
              providerCode,
              providerName: "khmer_topup",
              requiresServer: needsServer,
              active: true,
              sort: sort++,
            },
          });
          created++;
        }
      }
    }
  }

  const total = await prisma.product.count({ where: { active: true } });
  logger.info("khmer topup catalog synced", { created, updated, total });
  return { ok: true, created, updated, total };
}

/** If DB has zero products and API key is set, pull catalogue once. */
export async function ensureCatalogSeeded() {
  try {
    const n = await prisma.product.count();
    if (n > 0) return;
    if (!env.KHMER_TOPUP_API_KEY) {
      logger.warn("No products in DB and KHMER_TOPUP_API_KEY not set — run seed or set key + sync");
      return;
    }
    logger.info("Empty product catalog — syncing from Khmer TopUp…");
    const r = await syncKhmerTopupCatalog();
    if (!r.ok) logger.error("auto catalog sync failed", { error: r.error });
    else logger.info("auto catalog sync done", r);
  } catch (e) {
    logger.error("ensureCatalogSeeded failed", { err: String(e) });
  }
}
