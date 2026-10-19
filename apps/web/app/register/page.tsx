"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

function Form() {
  const { t } = useI18n();
  const auth = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const REG = true;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      if (REG) await auth.register(email, password, name || undefined); else await auth.login(email, password);
      router.push(next.startsWith("/") ? next : "/");
    } catch (e: any) {
      const m = e?.message || "Register failed";
      if (e?.code === "EMAIL_TAKEN" || /already/i.test(m)) setErr("Email នេះមានរួចហើយ — សូម Login");
      else if (/password|min/i.test(m)) setErr("ពាក្យសម្ងាត់យ៉ាងហោច 8 តួ");
      else if (/fetch|Failed|Network|CORS/i.test(m)) setErr("ភ្ជាប់ API មិនបាន — ពិនិត្យ NEXT_PUBLIC_API_URL");
      else setErr(m);
      setBusy(false);
    }
  }
  return (
    <Card className="mx-auto max-w-sm">
      <form onSubmit={submit} className="space-y-3">
        <h1 className="text-xl font-bold">{REG ? t("register") : t("login")}</h1>
        {REG && <div><Label>{t("name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>}
        <div><Label>{t("email")}</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label>{t("password")}</Label><Input type="password" required minLength={REG ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <Button className="w-full" disabled={busy}>{REG ? t("register") : t("login")}</Button>
        <p className="text-center text-sm"><Link className="text-brand-600 underline" href={REG ? "/login" : "/register"}>{REG ? t("login") : t("register")}</Link></p>
      </form>
    </Card>
  );
}

export default function Page() { return <Suspense><Form /></Suspense>; }
