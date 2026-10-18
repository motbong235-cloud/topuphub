import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { forbidden, unauthorized } from "../lib/errors";

export const signToken = (u: { id: string; role: Role }) =>
  jwt.sign({ sub: u.id, role: u.role }, env.JWT_SECRET, { expiresIn: "7d" });

/** JWT auth + RBAC. The role is re-read from the database so demotions take effect immediately. */
export function requireAuth(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (async () => {
      const h = req.headers.authorization ?? "";
      const token = h.startsWith("Bearer ") ? h.slice(7) : "";
      if (!token) throw unauthorized("Missing token");
      let sub: string;
      try {
        sub = (jwt.verify(token, env.JWT_SECRET) as { sub: string }).sub;
      } catch {
        throw unauthorized("Invalid or expired token", "INVALID_TOKEN");
      }
      const user = await prisma.user.findUnique({ where: { id: sub }, select: { id: true, role: true } });
      if (!user) throw unauthorized("User no longer exists", "INVALID_TOKEN");
      if (roles.length && !roles.includes(user.role)) throw forbidden("Insufficient role");
      req.user = user;
      next();
    })().catch(next);
  };
}
