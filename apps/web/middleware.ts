import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_PATH = (process.env.NEXT_PUBLIC_ADMIN_PATH || "th-console").replace(/^\/+|\/+$/g, "");

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /th-console (or custom) → serve admin UI
  if (pathname === `/${ADMIN_PATH}` || pathname.startsWith(`/${ADMIN_PATH}/`)) {
    const url = req.nextUrl.clone();
    const rest = pathname.slice(`/${ADMIN_PATH}`.length) || "";
    url.pathname = `/admin${rest}`;
    return NextResponse.rewrite(url);
  }

  // Block direct /admin — pretend 404
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
