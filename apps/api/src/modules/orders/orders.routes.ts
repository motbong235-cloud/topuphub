import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/asyncHandler";
import { notFound } from "../../lib/errors";
import { requireAuth } from "../../middleware/auth";
import { publicOrder } from "./orders.service";

export const ordersRouter = Router();
ordersRouter.use(requireAuth());

ordersRouter.get("/", asyncHandler(async (req, res) => {
  const rows = await prisma.order.findMany({
    where: { userId: req.user!.id }, include: { product: true }, orderBy: { createdAt: "desc" }, take: 50,
  });
  res.json({ orders: rows.map(publicOrder) });
}));

ordersRouter.get("/:code", asyncHandler(async (req, res) => {
  const o = await prisma.order.findFirst({
    where: { userId: req.user!.id, OR: [{ code: req.params.code }, { id: req.params.code }] }, include: { product: true },
  });
  if (!o) throw notFound("Order not found");
  res.json({ order: publicOrder(o) });
}));
