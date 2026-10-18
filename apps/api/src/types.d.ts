import type { Reseller, Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
      reseller?: Reseller;
      rawBody?: Buffer;
    }
  }
}
export {};
