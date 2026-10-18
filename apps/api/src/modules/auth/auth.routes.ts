import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../lib/asyncHandler";
import { conflict, unauthorized } from "../../lib/errors";
import { requireAuth, signToken } from "../../middleware/auth";
import { authLimiter } from "../../middleware/rateLimit";

export const authRouter = Router();

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 11); // real hash so unknown emails cost the same time as wrong passwords

const registerSchema = z.object({
  email: z.string().email().max(120).transform((s) => s.toLowerCase()),
  password: z.string().min(8).max(100),
  name: z.string().trim().min(1).max(60).optional(),
});

const publicUser = (u: { id: string; email: string; name: string | null; role: string; locale: string }) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, locale: u.locale,
});

authRouter.post("/register", authLimiter, asyncHandler(async (req, res) => {
  const body = registerSchema.parse(req.body);
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict("Email already registered", "EMAIL_TAKEN");
  const user = await prisma.user.create({
    data: { email: body.email, name: body.name, passwordHash: await bcrypt.hash(body.password, 11) },
  });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

authRouter.post("/login", authLimiter, asyncHandler(async (req, res) => {
  const body = z.object({ email: z.string().email().transform((s) => s.toLowerCase()), password: z.string().min(1).max(100) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized("Wrong email or password", "INVALID_CREDENTIALS");
  res.json({ token: signToken(user), user: publicUser(user) });
}));

authRouter.get("/me", requireAuth(), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ user: publicUser(user) });
}));

authRouter.put("/locale", requireAuth(), asyncHandler(async (req, res) => {
  const { locale } = z.object({ locale: z.enum(["km", "en"]) }).parse(req.body);
  await prisma.user.update({ where: { id: req.user!.id }, data: { locale } });
  res.json({ ok: true });
}));
