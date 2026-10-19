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

      // Static ADMIN_TOKEN from env (private panel login)
      if (env.ADMIN_TOKEN && token === env.ADMIN_TOKEN) {
        if (roles.length && !roles.includes("ADMIN")) throw forbidden("Insufficient role");
        const email = (env.ADMIN_EMAIL || "admin@topuphub.local").toLowerCase();
        let user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
        if (!user) {
          // lazy create minimal admin row for FK-safe operations
          const bcrypt = await import("bcryptjs");
          const crypto = await import("crypto");
          const created = await prisma.user.create({
            data: {
              email,
              name: "Admin",
              role: "ADMIN",
              passwordHash: await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 8),
            },
            select: { id: true, role: true },
          });
          user = created;
        } else if (user.role !== "ADMIN") {
          user = await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" }, select: { id: true, role: true } });
        }
        req.user = user;
        return next();
      }

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
