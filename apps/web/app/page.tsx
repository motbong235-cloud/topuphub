"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useData } from "@/lib/useData";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function Home() {
  const { t } = useI18n();
  const { data, loading, error } = useData<{ products: any[] }>("/api/products");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const cats = useMemo(() => ["all", ...Array.from(new Set((data?.products ?? []).map((p) => p.category)))], [data]);
  const list = (data?.products ?? []).filter((p) => (cat === "all" || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-6 text-white">
        <h1 className="text-2xl font-extrabold">TopUpHub</h1>
        <p className="mt-1 text-sm opacity-90">Instant game top-up · ABA PAY / KHQR · 24/7</p>
      </div>
      <Input placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex gap-2 overflow-x-auto">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cn("rounded-full border px-3 py-1 text-sm", cat === c ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white")}>
            {c === "all" ? t("all") : c}
          </button>
        ))}
      </div>
      {loading && <p>{t("loading")}</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !list.length && <p className="text-slate-500">{t("noProducts")}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {list.map((p) => (
          <Link key={p.id} href={`/products/${p.slug}`}>
            <Card className="h-full transition hover:border-brand-500">
              {p.image_url && <img src={p.image_url} alt={p.name} className="mb-2 h-24 w-full rounded-lg object-cover" />}
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="mt-1 text-brand-600 font-bold">{p.currency === "USD" ? "$" : ""}{p.price}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
