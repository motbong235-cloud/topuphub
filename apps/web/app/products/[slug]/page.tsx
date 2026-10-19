"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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

  if (loading) return <p className="page-enter text-slate-500">{t("loading")}</p>;
  if (error || !data) return <p className="text-red-600">{error ?? "Not found"}</p>;
  const p = data.product;
  const total = (Number(p.price) * qty).toFixed(2);
  const packLabel = p.pack_label || p.name;
  const gameName = p.game_name || "";
  const gameKey = p.game_key || p.category;

  async function pay() {
    if (!user) return router.push(`/login?next=/products/${slug}`);
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ tranId: string }>("/api/payments/payway/create", {
        token,
        body: { productId: p.id, target, serverId: serverId || undefined, quantity: qty },
      });
      router.push(`/pay/${r.tranId}`);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="page-enter mx-auto max-w-md space-y-4">
      {gameKey ? (
        <Link href={`/games/${encodeURIComponent(gameKey)}`} className="text-sm font-semibold text-brand-600 hover:underline">
          ← {gameName || "Packages"}
        </Link>
      ) : (
        <Link href="/" className="text-sm font-semibold text-brand-600 hover:underline">
          ← Home
        </Link>
      )}

      <div className="checkout-shell">
        <div className="checkout-head">
          {gameName ? <p className="text-[11px] font-bold uppercase tracking-wide text-blue-200">{gameName}</p> : null}
          <h1 className="text-xl font-black">{packLabel}</h1>
          <p className="mt-1 text-2xl font-black text-white">${Number(p.price).toFixed(2)}</p>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <Label>{t("playerId")}</Label>
            <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Player / User ID" />
          </div>
          {p.requires_server && (
            <div>
              <Label>{t("serverId")}</Label>
              <Input value={serverId} onChange={(e) => setServerId(e.target.value)} placeholder="Server / Zone ID" />
            </div>
          )}
          <div>
            <Label>{t("quantity")}</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-sm font-semibold text-slate-600">{t("total")}</span>
            <span className="text-xl font-black text-brand-600">${total}</span>
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <Button
            className="w-full py-3 text-base"
            disabled={busy || !target.trim() || (p.requires_server && !serverId.trim())}
            onClick={pay}
          >
            {user ? t("payNow") : t("loginToBuy")}
          </Button>
        </div>
      </div>
    </div>
  );
}
