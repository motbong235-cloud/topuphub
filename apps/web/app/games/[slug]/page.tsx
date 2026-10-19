"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Product = {
  id: string;
  slug: string;
  name: string;
  price: string | number;
  currency: string;
  game_key?: string;
  game_name?: string;
  pack_label?: string;
  category?: string;
  requires_server?: boolean;
  image_url?: string;
};

export default function GamePackagesPage() {
  const { slug } = useParams<{ slug: string }>();
  const gameSlug = decodeURIComponent(slug || "");
  const { t } = useI18n();
  const [list, setList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/products")
      .then((d) => setList(d.products || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const packs = useMemo(() => {
    return list.filter((p) => {
      const fromName = p.name.includes(" · ") ? p.name.split(" · ")[0].trim() : "";
      const key =
        p.game_key ||
        (p.category && p.category !== "game" ? p.category : "") ||
        (fromName
          ? fromName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
          : p.slug);
      return key === gameSlug || p.slug.startsWith(gameSlug + "-");
    });
  }, [list, gameSlug]);

  const gameName = packs[0]?.game_name || packs[0]?.name?.split(" · ")[0] || gameSlug;

  return (
    <div className="page-enter mx-auto max-w-lg space-y-5">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
        ← ត្រលប់ទៅហ្គេម
      </Link>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div
          className="relative px-5 py-6 text-white"
          style={{ background: "linear-gradient(125deg,#082044,#1d6adf)" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-200">Service</p>
          <h1 className="mt-1 text-xl font-black sm:text-2xl">{gameName}</h1>
          <p className="mt-1 text-sm text-blue-100">{packs.length} កញ្ចប់ · ជ្រើសហើយ top-up</p>
        </div>

        <div className="space-y-2.5 p-4">
          {loading && <p className="text-sm text-slate-500">{t("loading") || "Loading…"}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !packs.length && (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-600">
              មិនមានកញ្ចប់ — Admin Sync Khmer TopUp
            </p>
          )}

          {packs.map((p) => {
            const label =
              p.pack_label ||
              (p.name.includes(" · ") ? p.name.split(" · ").slice(1).join(" · ") : p.name);
            return (
              <Link key={p.id} href={`/products/${p.slug}`} className="pack-row block">
                <div className="pack-icon">{String(label).replace(/[^\d]/g, "").slice(0, 3) || "◆"}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-slate-800">{label}</div>
                  <div className="text-xs text-slate-500">
                    {p.requires_server ? "ត្រូវ Server / Zone ID" : "Player ID"}
                  </div>
                </div>
                <div className="pack-price">${Number(p.price).toFixed(2)}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
