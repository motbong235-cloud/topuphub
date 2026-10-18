"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import { useI18n } from "@/lib/i18n";

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { user, token } = useAuth();
  const { data, loading, error } = useData<{ product: any }>(`/api/products/${slug}`);
  const [target, setTarget] = useState("");
  const [serverId, setServerId] = useState("");
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <p>{t("loading")}</p>;
  if (error || !data) return <p className="text-red-600">{error ?? "Not found"}</p>;
  const p = data.product;
  const total = (Number(p.price) * qty).toFixed(2);

  async function pay() {
    if (!user) return router.push(`/login?next=/products/${slug}`);
    setBusy(true); setErr("");
    try {
      const r = await api<{ tranId: string }>("/api/payments/payway/create", { token, body: { productId: p.id, target, serverId: serverId || undefined, quantity: qty } });
      router.push(`/pay/${r.tranId}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">{p.name}</h1>
          {p.description && <p className="mt-1 text-sm text-slate-600">{p.description}</p>}
        </div>
        <div><Label>{t("playerId")}</Label><Input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="text" /></div>
        {p.requires_server && <div><Label>{t("serverId")}</Label><Input value={serverId} onChange={(e) => setServerId(e.target.value)} /></div>}
        <div><Label>{t("quantity")}</Label><Input type="number" min={1} max={50} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} /></div>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-slate-600">{t("total")}</span><span className="text-xl font-extrabold text-brand-600">${total}</span>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <Button className="w-full" disabled={busy || !target.trim() || (p.requires_server && !serverId.trim())} onClick={pay}>
          {user ? t("payNow") : t("loginToBuy")}
        </Button>
      </Card>
    </div>
  );
}
