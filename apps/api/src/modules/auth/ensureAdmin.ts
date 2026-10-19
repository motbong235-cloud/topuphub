import bcrypt from "bcryptjs";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";

/** Create / promote ADMIN from ADMIN_EMAIL + ADMIN_PASSWORD env. */
export async function ensureAdmin() {
  const email = (env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) {
    logger.warn("ADMIN_EMAIL / ADMIN_PASSWORD not set — skip admin bootstrap");
    return;
  }
  if (password.length < 8) {
    logger.warn("ADMIN_PASSWORD too short (<8) — skip admin bootstrap");
    return;
  }
  try {
    const hash = await bcrypt.hash(password, 11);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({
        data: { email, name: "Admin", role: "ADMIN", passwordHash: hash },
      });
      logger.info("Admin account created", { email });
      return;
    }
    await prisma.user.update({
      where: { email },
      data: { role: "ADMIN", passwordHash: hash },
    });
    logger.info("Admin account updated from env", { email });
  } catch (e) {
    logger.error("ensureAdmin failed", { err: String(e) });
  }
}
