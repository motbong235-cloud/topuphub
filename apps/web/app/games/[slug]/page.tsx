"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  game_key?: string;
  game_name?: string;
  pack_label?: string;
  category?: string;
  requires_server?: boolean;
};

function gameKeyOf(p: Product) {
  return p.game_key || p.category || "";
}

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

  const packs = useMemo(
    () => list.filter((p) => gameKeyOf(p) === gameSlug || p.slug.startsWith(gameSlug)),
    [list, gameSlug],
  );
  const gameName = packs[0]?.game_name || packs[0]?.name?.split(" · ")[0] || gameSlug;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/" className="text-brand-600 underline">
          ← Games
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-extrabold sm:text-2xl">{gameName}</h1>
        <p className="text-sm text-slate-500">{packs.length} packages · ជ្រើសកញ្ចប់</p>
      </div>

      {loading && <p>{t("loading") || "Loading…"}</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !packs.length && (
        <Card className="p-4 text-sm text-slate-600">
          No packages for this game. Admin → <b>Sync from Khmer TopUp</b>
        </Card>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {packs.map((p) => {
          const label = p.pack_label || (p.name.includes(" · ") ? p.name.split(" · ").slice(1).join(" · ") : p.name);
          return (
            <Link key={p.id} href={`/products/${p.slug}`}>
              <Card className="card-hover flex items-center justify-between gap-3 border-slate-200 p-4 shadow-soft">
                <div>
                  <div className="font-bold">{label}</div>
                  {p.requires_server ? (
                    <div className="mt-0.5 text-xs text-slate-500">Requires server / zone ID</div>
                  ) : null}
                </div>
                <div className="text-right">
                  <div className="text-lg font-extrabold text-brand-600">
                    ${Number(p.price).toFixed(2)}
                  </div>
                  <div className="text-xs font-bold text-brand-500">Top Up →</div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
