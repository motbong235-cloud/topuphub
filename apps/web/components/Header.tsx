"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
import { ADMIN_PATH } from "@/lib/adminPath";

export function Header() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-black text-white shadow-sm">
            TH
          </span>
          <span className="text-lg font-extrabold text-brand-600">{t("brand")}</span>
        </Link>
        <nav className="ml-2 hidden items-center gap-3 text-sm font-semibold sm:flex">
          {user && (
            <Link href="/orders" className="text-slate-600 hover:text-brand-600">
              {t("myOrders")}
            </Link>
          )}
          {user && (user.role === "RESELLER" || user.role === "ADMIN") && (
            <Link href="/reseller" className="text-slate-600 hover:text-brand-600">
              {t("reseller")}
            </Link>
          )}
          {user?.role === "ADMIN" && (
            <Link href={`/${ADMIN_PATH}`} className="text-slate-600 hover:text-brand-600">
              {t("admin")}
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={() => setLang(lang === "km" ? "en" : "km")}>
            {lang === "km" ? "EN" : "ខ្មែរ"}
          </Button>
          {user ? (
            <Button variant="outline" onClick={logout}>
              {t("logout")}
            </Button>
          ) : (
            <>
              <Link href="/login">
                <Button variant="outline">{t("login")}</Button>
              </Link>
              <Link href="/register" className="hidden sm:block">
                <Button>{t("register")}</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
