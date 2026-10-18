"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const DONE = ["COMPLETED", "FAILED", "REFUNDED"];

export default function OrderPage() {
  const { code } = useParams<{ code: string }>();
  const cancelled = useSearchParams().get("cancelled");
  const { t } = useI18n();
  const { token, loading } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) return;
    let stop = false;
    async function tick() {
      try {
        const r = await api<{ order: any }>(`/api/payments/${code}/status`, { token });
        if (stop) return;
        setOrder(r.order);
        if (!DONE.includes(r.order.status)) setTimeout(tick, 3000); // poll until delivered
      } catch (e: any) { if (!stop) setErr(e.message); }
    }
    tick();
    return () => { stop = true; };
  }, [code, token]);

  if (loading) return <p>{t("loading")}</p>;
  if (!token) return <Link href={`/login?next=/orders/${code}`} className="text-brand-600 underline">{t("login")}</Link>;
  if (err) return <p className="text-red-600">{err}</p>;
  if (!order) return <p>{t("loading")}</p>;

  return (
    <Card className="mx-auto max-w-md space-y-3">
      {cancelled && order.status === "PENDING_PAYMENT" && <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">{t("cancelled")}</p>}
      <div className="flex items-center justify-between"><h1 className="font-bold">{t("order")} {order.code}</h1><Badge value={order.status} label={t(order.status)} /></div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-slate-500">{order.product.name}</dt><dd className="text-right">× {order.quantity}</dd>
        <dt className="text-slate-500">ID</dt><dd className="text-right">{order.target}{order.server_id ? ` (${order.server_id})` : ""}</dd>
        <dt className="text-slate-500">{t("amount")}</dt><dd className="text-right font-bold">${order.amount}</dd>
      </dl>
      {order.status === "PROCESSING" && <p className="text-sm text-slate-500">{t("PROCESSING")}…</p>}
      {order.fail_reason && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{order.fail_reason}</p>}
    </Card>
  );
}
