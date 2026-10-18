"use client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import { useI18n } from "@/lib/i18n";

export default function Orders() {
  const { t } = useI18n();
  const { token, loading: authLoading } = useAuth();
  const { data, loading } = useData<{ orders: any[] }>(token ? "/api/orders" : null, token);
  if (authLoading || loading) return <p>{t("loading")}</p>;
  if (!token) return <Link href="/login?next=/orders" className="text-brand-600 underline">{t("login")}</Link>;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t("myOrders")}</h1>
      {!data?.orders.length && <p className="text-slate-500">{t("noOrders")}</p>}
      {data?.orders.map((o) => (
        <Link key={o.id} href={`/orders/${o.code}`}>
          <Card className="mb-3 flex items-center justify-between hover:border-brand-500">
            <div><div className="font-semibold">{o.product.name}</div><div className="text-xs text-slate-500">{o.code} · {new Date(o.created_at).toLocaleString()}</div></div>
            <div className="text-right"><div className="font-bold">${o.amount}</div><Badge value={o.status} label={t(o.status)} /></div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
