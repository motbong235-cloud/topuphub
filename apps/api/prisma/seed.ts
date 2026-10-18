import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const d = (n: number) => new Prisma.Decimal(n.toFixed(2));

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@topuphub.site").toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("Set ADMIN_PASSWORD (min 8 chars) to create the admin account");
  await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN" },
    create: { email, name: "Admin", role: "ADMIN", passwordHash: await bcrypt.hash(password, 11) },
  });

  // EXAMPLE products. Replace providerCode with the real Khmer Topup package ids from your account.
  const examples = [
    { slug: "mlbb-86", name: "Mobile Legends 86 Diamonds", category: "game", price: 1.5, reseller: 1.35, code: "1", server: true },
    { slug: "mlbb-172", name: "Mobile Legends 172 Diamonds", category: "game", price: 2.9, reseller: 2.65, code: "2", server: true },
    { slug: "ff-100", name: "Free Fire 100 Diamonds", category: "game", price: 1.1, reseller: 0.98, code: "3", server: false },
    { slug: "ff-310", name: "Free Fire 310 Diamonds", category: "game", price: 3.2, reseller: 2.95, code: "4", server: false },
  ];
  for (const [i, p] of examples.entries()) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: { slug: p.slug, name: p.name, category: p.category, price: d(p.price), resellerPrice: d(p.reseller), providerCode: p.code, requiresServer: p.server, sort: i },
    });
  }
  console.log(`Seeded admin ${email} and ${examples.length} example products.`);
}

main().finally(() => prisma.$disconnect());
