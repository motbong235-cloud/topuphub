import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/asyncHandler";
import { notFound } from "../../lib/errors";

export const catalogRouter = Router();

function gameKeyOf(p: { category?: string | null; name: string; slug: string }) {
  if (p.category && p.category !== "game") return p.category;
  const parts = String(p.name || "").split(" · ");
  if (parts.length >= 2) return slugify(parts[0]);
  // fallback first segment of slug before first package id-ish
  return slugify(p.slug.split("-").slice(0, 2).join("-") || p.slug);
}

function gameNameOf(p: { name: string }) {
  const parts = String(p.name || "").split(" · ");
  return parts.length >= 2 ? parts[0].trim() : p.name;
}

function packLabelOf(p: { description?: string | null; name: string }) {
  if (p.description) return p.description;
  const parts = String(p.name || "").split(" · ");
  return parts.length >= 2 ? parts.slice(1).join(" · ").trim() : p.name;
}

function slugify(s: string) {
  return String(s || "game")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "game";
}

const publicProduct = (p: any) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  description: p.description,
  category: p.category,
  game_key: gameKeyOf(p),
  game_name: gameNameOf(p),
  pack_label: packLabelOf(p),
  image_url: p.imageUrl,
  price: p.price.toFixed(2),
  currency: p.currency,
  requires_server: p.requiresServer,
});

catalogRouter.get("/", asyncHandler(async (_req, res) => {
  const list = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ sort: "asc" }, { name: "asc" }],
  });
  res.json({ products: list.map(publicProduct) });
}));

/** Games grouped with packages — for storefront navigation */
catalogRouter.get("/meta/games", asyncHandler(async (_req, res) => {
  const list = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ sort: "asc" }, { name: "asc" }],
  });
  const map = new Map<string, { slug: string; name: string; image_url?: string | null; packages: any[] }>();
  for (const p of list) {
    const key = gameKeyOf(p);
    if (!map.has(key)) {
      map.set(key, {
        slug: key,
        name: gameNameOf(p),
        image_url: p.imageUrl,
        packages: [],
      });
    }
    map.get(key)!.packages.push(publicProduct(p));
  }
  const games = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  res.json({ games });
}));

catalogRouter.get("/:slug", asyncHandler(async (req, res) => {
  const p = await prisma.product.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!p) throw notFound("Product not found");
  res.json({ product: publicProduct(p) });
}));
