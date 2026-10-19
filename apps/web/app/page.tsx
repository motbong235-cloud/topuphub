"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

function slugify(s: string) {
  return String(s || "game")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "game";
}

function groupGames(products: Product[]): Game[] {
  const map = new Map<string, Game>();
  for (const p of products) {
    const fromName = p.name.includes(" · ") ? p.name.split(" · ")[0].trim() : "";
    const name = p.game_name || fromName || p.name;
    let key = p.game_key || "";
    if (!key && p.category && p.category !== "game") key = p.category;
    if (!key) key = slugify(fromName || p.name);
    if (!map.has(key)) {
      map.set(key, { slug: key, name, image_url: p.image_url, packages: [] });
    }
    map.get(key)!.packages.push(p);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const GRADIENTS = [
  "linear-gradient(145deg,#1d6adf 0%,#0b3d91 100%)",
  "linear-gradient(145deg,#0f766e 0%,#134e4a 100%)",
  "linear-gradient(145deg,#7c3aed 0%,#4c1d95 100%)",
  "linear-gradient(145deg,#d97706 0%,#9a3412 100%)",
  "linear-gradient(145deg,#db2777 0%,#9d174d 100%)",
  "linear-gradient(145deg,#0284c7 0%,#0c4a6e 100%)",
];

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
    <div className="page-enter space-y-6">
      <section className="hero-banner">
        <p className="relative z-10 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-200">
          TopUpHub Cambodia
        </p>
        <h1 className="relative z-10 mt-1 text-2xl font-black leading-tight sm:text-3xl">
          Top-up ហ្គេមលឿន · សុវត្ថិភាព
        </h1>
        <p className="relative z-10 mt-2 max-w-lg text-sm text-blue-100/95">
          ជ្រើសហ្គេម → ជ្រើសកញ្ចប់ → បង់ KHQR · ភ្ជាប់ Khmer TopUp
        </p>
        <div className="relative z-10 mt-4 flex flex-wrap gap-2">
          {["KHQR", "Khmer TopUp", "Reseller API"].map((x) => (
            <span key={x} className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
              {x}
            </span>
          ))}
        </div>
      </section>

      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 ស្វែងរកហ្គេម… Search games"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm shadow-sm outline-none ring-brand-500/20 transition focus:border-brand-500 focus:ring-4"
        />
      </div>

      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">{t("products") || "Games"}</h2>
          <p className="text-xs text-slate-500">ជ្រើសសេវាកម្មហ្គេម</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500 shadow-sm">
          {filtered.length}
        </span>
      </div>

      {loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-200/70" />
          ))}
        </div>
      )}
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {!loading && !filtered.length && (
        <div className="soft-panel text-center text-sm text-slate-600">
          មិនទាន់មានហ្គេម — Admin → <b>Sync from Khmer TopUp</b>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {filtered.map((g, i) => {
          const minPrice = Math.min(...g.packages.map((p) => Number(p.price) || Infinity));
          const art = g.image_url
            ? { backgroundImage: `url(${g.image_url})` }
            : { background: GRADIENTS[i % GRADIENTS.length] };
          return (
            <Link key={g.slug} href={`/games/${encodeURIComponent(g.slug)}`} className="game-tile card-hover block">
              <div className="game-tile-art" style={art as any}>
                <div className="relative z-10">
                  <div className="text-[11px] font-bold text-white/80">{g.packages.length} packs</div>
                  <div className="text-sm font-black text-white drop-shadow">{g.name}</div>
                </div>
              </div>
              <div className="game-tile-body">
                <div className="text-sm font-bold text-slate-800 line-clamp-1">{g.name}</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">ពី</span>
                  <span className="text-sm font-extrabold text-brand-600">
                    ${Number.isFinite(minPrice) ? minPrice.toFixed(2) : "—"}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
