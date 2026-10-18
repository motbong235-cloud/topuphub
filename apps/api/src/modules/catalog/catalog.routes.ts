import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/asyncHandler";
import { notFound } from "../../lib/errors";

export const catalogRouter = Router();

const publicProduct = (p: any) => ({
  id: p.id, slug: p.slug, name: p.name, description: p.description, category: p.category, image_url: p.imageUrl,
  price: p.price.toFixed(2), currency: p.currency, requires_server: p.requiresServer,
});

catalogRouter.get("/", asyncHandler(async (_req, res) => {
  const list = await prisma.product.findMany({ where: { active: true }, orderBy: [{ sort: "asc" }, { name: "asc" }] });
  res.json({ products: list.map(publicProduct) });
}));

catalogRouter.get("/:slug", asyncHandler(async (req, res) => {
  const p = await prisma.product.findFirst({ where: { slug: req.params.slug, active: true } });
  if (!p) throw notFound("Product not found");
  res.json({ product: publicProduct(p) });
}));
