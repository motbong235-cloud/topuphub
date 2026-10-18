"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Product = {
  id: string;
  slug: string;
  name: string;
  price: string | number;
  currency: string;
  image_url?: string;
};

export default function HomePage() {
  const { t } = useI18n();
  const [list, setList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    api("/api/products")
      .then((d) => setList(d.products || d || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = list.filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return p.name.toLowerCase().includes(s) || p.slug.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-5">
      <section className="hero-banner">
        <p className="text-xs font-bold uppercase tracking-wider text-blue-200 relative z-10">TopUpHub</p>
        <h1 className="mt-1 text-2xl font-black relative z-10 sm:text-3xl">
          ហាងហ្គេមព្រីមៀម · Fast Game Top-up
        </h1>
        <p className="mt-2 max-w-md text-sm text-blue-100 relative z-10">
          បង់តាម KHQR (Khmer System / ABA) · Auto top-up តាម Khmer TopUp · Reseller API
        </p>
        <div className="mt-4 flex flex-wrap gap-2 relative z-10">
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">KHQR</span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">Khmer TopUp</span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">Reseller</span>
        </div>
      </section>

      <div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ស្វែងរកហ្គេម… Search games"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-soft outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      <div className="flex items-end justify-between gap-2">
        <h2 className="text-lg font-extrabold">{t("products") || "All Games"}</h2>
        <span className="text-xs font-semibold text-slate-500">{loading ? "…" : `${filtered.length} items`}</span>
      </div>

      {loading && <p className="text-slate-500">{t("loading")}</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !filtered.length && <p className="text-slate-500">{t("noProducts")}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {filtered.map((p, i) => (
          <Link key={p.id} href={`/products/${p.slug}`}>
            <Card className="card-hover h-full border-slate-200 shadow-soft">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="mb-2 h-24 w-full rounded-xl object-cover" />
              ) : (
                <div
                  className="mb-2 flex h-24 items-center justify-center rounded-xl text-2xl font-black text-white"
                  style={{
                    background: [
                      "linear-gradient(145deg,#4aa2ff,#1d6adf)",
                      "linear-gradient(145deg,#f59e0b,#d97706)",
                      "linear-gradient(145deg,#34d399,#059669)",
                      "linear-gradient(145deg,#a78bfa,#7c3aed)",
                    ][i % 4],
                  }}
                >
                  {(p.name || "?").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="text-sm font-bold leading-snug">{p.name}</div>
              <div className="mt-1 text-base font-extrabold text-brand-600">
                {p.currency === "USD" ? "$" : ""}
                {p.price}
              </div>
              <div className="mt-2 rounded-lg bg-brand-50 py-1.5 text-center text-xs font-bold text-brand-600">
                Top Up
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
