"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  game_key?: string;
  game_name?: string;
  pack_label?: string;
  category?: string;
};

type Game = {
  slug: string;
  name: string;
  image_url?: string | null;
  packages: Product[];
};

function groupGames(products: Product[]): Game[] {
  const map = new Map<string, Game>();
  for (const p of products) {
    const key = p.game_key || p.category || "other";
    const name = p.game_name || (p.name.includes(" · ") ? p.name.split(" · ")[0] : p.name);
    if (!map.has(key)) {
      map.set(key, { slug: key, name, image_url: p.image_url, packages: [] });
    }
    map.get(key)!.packages.push(p);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function HomePage() {
  const { t } = useI18n();
  const [list, setList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    api("/api/products")
      .then((d) => setList(d.products || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const games = useMemo(() => groupGames(list), [list]);
  const filtered = games.filter((g) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return g.name.toLowerCase().includes(s) || g.slug.includes(s);
  });

  return (
    <div className="space-y-5">
      <section className="hero-banner">
        <p className="text-xs font-bold uppercase tracking-wider text-blue-200 relative z-10">TopUpHub</p>
        <h1 className="mt-1 text-2xl font-black relative z-10 sm:text-3xl">
          ហាងហ្គេមព្រីមៀម · Fast Game Top-up
        </h1>
        <p className="mt-2 max-w-md text-sm text-blue-100 relative z-10">
          ជ្រើសហ្គេម → ជ្រើសកញ្ចប់ · បង់ KHQR · Auto top-up
        </p>
      </section>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ស្វែងរកហ្គេម… Search games"
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-soft outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      />

      <div className="flex items-end justify-between gap-2">
        <h2 className="text-lg font-extrabold">{t("products") || "Games"}</h2>
        <span className="text-xs text-slate-500">{filtered.length} games</span>
      </div>

      {loading && <p className="text-slate-500">{t("loading") || "Loading…"}</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !filtered.length && (
        <p className="text-slate-500">
          {t("noProducts") || "No games yet — Admin → Sync from Khmer TopUp"}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {filtered.map((g, i) => {
          const minPrice = Math.min(...g.packages.map((p) => Number(p.price) || 0));
          return (
            <Link key={g.slug} href={`/games/${encodeURIComponent(g.slug)}`}>
              <Card className="card-hover h-full border-slate-200 shadow-soft">
                {g.image_url ? (
                  <img src={g.image_url} alt={g.name} className="mb-2 h-24 w-full rounded-xl object-cover" />
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
                    {(g.name || "?").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="text-sm font-bold leading-snug">{g.name}</div>
                <div className="mt-1 text-xs text-slate-500">{g.packages.length} packages</div>
                <div className="mt-1 text-sm font-extrabold text-brand-600">
                  from ${Number.isFinite(minPrice) ? minPrice.toFixed(2) : "—"}
                </div>
                <div className="mt-2 rounded-lg bg-brand-50 py-1.5 text-center text-xs font-bold text-brand-600">
                  មើលកញ្ចប់
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
