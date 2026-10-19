"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import { cn } from "@/lib/utils";
import { LogTable } from "@/components/LogTable";
import { ADMIN_PATH } from "@/lib/adminPath";

const TABS = ["stats", "products", "orders", "resellers", "transactions", "provider-logs"] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const { user, token, loading, loginWithToken } = useAuth();
  const [tab, setTab] = useState<Tab>("stats");
  const [msg, setMsg] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [busy, setBusy] = useState(false);
  if (loading) return <p>…</p>;
  if (!user || user.role !== "ADMIN") {
    return (
      <Card className="mx-auto max-w-sm space-y-3 p-5">
        <h1 className="text-lg font-extrabold">Admin Token</h1>
        <p className="text-sm text-slate-500">បំពេញ ADMIN_TOKEN (មិនប្រើ email/password)</p>
        <div>
          <Label>Token</Label>
          <Input
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            placeholder="ADMIN_TOKEN"
            autoFocus
          />
        </div>
        {msg && <p className="text-sm text-red-600">{msg}</p>}
        <Button
          className="w-full"
          disabled={busy || !adminToken.trim()}
          onClick={async () => {
            setBusy(true);
            setMsg("");
            try {
              await loginWithToken(adminToken.trim());
            } catch (e: any) {
              setMsg(e?.code === "ADMIN_TOKEN_NOT_CONFIGURED"
                ? "API មិនទាន់មាន ADMIN_TOKEN — ដាក់ក្នុង Render env រួច Redeploy API"
                : e?.code === "INVALID_ADMIN_TOKEN"
                  ? "Token មិនត្រូវ — ពិនិត្យ copy/space ឬ env ខុស"
                  : (e.message || "Invalid token"));
              setBusy(false);
            }
          }}
        >
          {busy ? "…" : "ចូល Admin"}
        </Button>
      </Card>
    );
  }

  const act = async (fn: () => Promise<unknown>) => { setMsg(""); try { await fn(); } catch (e: any) { setMsg(e.message); } };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((x) => <button key={x} onClick={() => setTab(x)} className={cn("rounded-full border px-3 py-1 text-sm", tab === x ? "border-brand-600 bg-brand-600 text-white" : "bg-white")}>{x}</button>)}
      </div>
      {msg && <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">{msg}</p>}
      {tab === "stats" && <Stats token={token} />}
      {tab === "products" && <Products token={token} act={act} setMsg={setMsg} />}
      {tab === "orders" && <Orders token={token} act={act} />}
      {tab === "resellers" && <Resellers token={token} act={act} setMsg={setMsg} />}
      {tab === "transactions" && <Transactions token={token} act={act} />}
      {tab === "provider-logs" && <ProviderLogs token={token} />}
    </div>
  );
}

function Stats({ token }: { token: string | null }) {
  const { data } = useData<any>("/api/admin/stats", token);
  if (!data) return <p>…</p>;
  const cards: [string, string | number][] = [
    ["Completed revenue", `$${data.completed_revenue}`], ["Users", data.users], ["Resellers", data.resellers],
    ["Needs review", data.needs_review], ["Refunds pending", data.refunds_pending],
    ...Object.entries(data.orders_by_status).map(([k, v]) => [k, v as number] as [string, number]),
  ];
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{cards.map(([k, v]) => <Card key={k}><div className="text-xs text-slate-500">{k}</div><div className="text-xl font-bold">{v}</div></Card>)}</div>;
}

function Products({ token, act, setMsg }: any) {
  const { data, reload } = useData<any>("/api/admin/products", token);
  const empty = { slug: "", name: "", price: "", resellerPrice: "", providerCode: "", category: "game", requiresServer: false };
  const [f, setF] = useState<any>(empty);
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  return (
    <div className="space-y-4">

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Button onClick={() => act(async () => {
          const r = await api("/api/admin/sync-catalog", { method: "POST", token, body: {} });
          setMsg(`Synced: +${r.created} new, ${r.updated} updated, total ${r.total}`);
          await reload();
        })}>Sync from Khmer TopUp</Button>
        <span className="text-xs text-slate-500">ទាញ games/packages ពី API key → products</span>
      </Card>
      <Card className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><Label>slug</Label><Input value={f.slug} onChange={(e) => set("slug", e.target.value)} /></div>
        <div><Label>name</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label>price</Label><Input value={f.price} onChange={(e) => set("price", e.target.value)} /></div>
        <div><Label>reseller price</Label><Input value={f.resellerPrice} onChange={(e) => set("resellerPrice", e.target.value)} /></div>
        <div><Label>Khmer Topup package id</Label><Input value={f.providerCode} onChange={(e) => set("providerCode", e.target.value)} /></div>
        <div><Label>category</Label><Input value={f.category} onChange={(e) => set("category", e.target.value)} /></div>
        <label className="flex items-end gap-2 text-sm"><input type="checkbox" checked={f.requiresServer} onChange={(e) => set("requiresServer", e.target.checked)} /> needs server id</label>
        <div className="flex items-end"><Button onClick={() => act(async () => { await api("/api/admin/products", { token, body: f }); setF(empty); await reload(); })}>Add product</Button></div>
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50"><tr>{["slug", "name", "price", "reseller", "code", "active", ""].map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr></thead>
          <tbody>{data?.products.map((p: any) => (
            <tr key={p.id} className="border-t">
              <td className="px-3 py-2">{p.slug}</td><td className="px-3 py-2">{p.name}</td><td className="px-3 py-2">{p.price}</td>
              <td className="px-3 py-2">{p.resellerPrice}</td><td className="px-3 py-2">{p.providerCode}</td><td className="px-3 py-2">{String(p.active)}</td>
              <td className="px-3 py-2"><Button variant="outline" onClick={() => act(async () => { await api(`/api/admin/products/${p.id}`, { method: "PUT", token, body: { active: !p.active } }); await reload(); })}>{p.active ? "Disable" : "Enable"}</Button></td>
            </tr>))}</tbody>
        </table>
      </Card>
    </div>
  );
}

function Orders({ token, act }: any) {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [review, setReview] = useState(false);
  const qs = new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), ...(review ? { review: "1" } : {}) }).toString();
  const { data, reload } = useData<any>(`/api/admin/orders?${qs}`, token);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select className="rounded-lg border px-2 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">all</option>{["PENDING_PAYMENT", "PAID", "PROCESSING", "COMPLETED", "FAILED", "REFUNDED"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <Input className="max-w-[200px]" placeholder="code / target / provider ref" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} /> needs review</label>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50"><tr>{["code", "product", "target", "$", "src", "status", "note", ""].map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr></thead>
          <tbody>{data?.orders.map((o: any) => (
            <tr key={o.id} className="border-t align-top">
              <td className="px-3 py-2">{o.code}</td><td className="px-3 py-2">{o.product.name}</td><td className="px-3 py-2">{o.target}</td>
              <td className="px-3 py-2">{o.amount}</td><td className="px-3 py-2">{o.source}</td><td className="px-3 py-2">{o.status}{o.needs_review ? " ⚠" : ""}</td>
              <td className="px-3 py-2 max-w-[220px]">{o.fail_reason}</td>
              <td className="space-x-1 px-3 py-2 whitespace-nowrap">
                {o.needs_review && <Button variant="outline" onClick={() => act(async () => { await api(`/api/admin/orders/${o.id}/resolve`, { token, body: { outcome: "COMPLETED" } }); await reload(); })}>Delivered</Button>}
                {o.needs_review && <Button variant="danger" onClick={() => act(async () => { if (confirm("Mark failed and refund?")) { await api(`/api/admin/orders/${o.id}/resolve`, { token, body: { outcome: "FAILED", note: "Not delivered (admin)" } }); await reload(); } })}>Fail + refund</Button>}
                {["PAID", "PROCESSING"].includes(o.status) && <Button variant="outline" onClick={() => act(async () => { const sure = !o.needs_review || confirm("Did the provider NOT deliver this order? Retrying may deliver twice."); if (sure) { await api(`/api/admin/orders/${o.id}/retry`, { token, body: { confirmNotDelivered: true } }); await reload(); } })}>Retry</Button>}
              </td>
            </tr>))}</tbody>
        </table>
      </Card>
    </div>
  );
}

function Resellers({ token, act, setMsg }: any) {
  const { data, reload } = useData<any>("/api/admin/resellers", token);
  const [email, setEmail] = useState("");
  const [created, setCreated] = useState<any>(null);
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1"><Label>Existing user email → make reseller</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <Button onClick={() => act(async () => { setCreated(await api("/api/admin/resellers", { token, body: { email } })); setEmail(""); await reload(); })}>Create reseller</Button>
      </Card>
      {created && (
        <Card className="border-amber-300 bg-amber-50 text-xs">
          <p className="font-semibold">Credentials (secret is shown only once):</p>
          <pre className="whitespace-pre-wrap break-all">{JSON.stringify(created, null, 2)}</pre>
          <Button variant="outline" onClick={() => setCreated(null)}>OK</Button>
        </Card>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50"><tr>{["email", "api key", "balance", "limit/min", "active", ""].map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr></thead>
          <tbody>{data?.resellers.map((r: any) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">{r.email}</td><td className="px-3 py-2">{r.api_key}</td><td className="px-3 py-2">${r.balance}</td>
              <td className="px-3 py-2">{r.rate_limit_per_min}</td><td className="px-3 py-2">{String(r.active)}</td>
              <td className="space-x-1 px-3 py-2 whitespace-nowrap">
                <Button variant="outline" onClick={() => act(async () => { await api(`/api/admin/resellers/${r.id}`, { method: "PUT", token, body: { active: !r.active } }); await reload(); })}>{r.active ? "Disable" : "Enable"}</Button>
                <Button variant="outline" onClick={() => act(async () => { const a = prompt("Credit amount (USD)"); if (a) { await api(`/api/admin/resellers/${r.id}/credit`, { token, body: { amount: Number(a), note: "Manual credit" } }); setMsg("Credited"); await reload(); } })}>Credit</Button>
              </td>
            </tr>))}</tbody>
        </table>
      </Card>
    </div>
  );
}

function Transactions({ token, act }: any) {
  const [type, setType] = useState("");
  const { data, reload } = useData<any>(`/api/admin/transactions${type ? `?type=${type}` : ""}`, token);
  return (
    <div className="space-y-3">
      <select className="rounded-lg border px-2 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="">all types</option>{["PAYMENT", "WALLET_TOPUP", "ORDER_DEBIT", "REFUND"].map((s) => <option key={s}>{s}</option>)}
      </select>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50"><tr>{["at", "type", "status", "gateway", "tran id", "$", "note", ""].map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr></thead>
          <tbody>{data?.transactions.map((t: any) => (
            <tr key={t.id} className="border-t">
              <td className="px-3 py-2">{new Date(t.at).toLocaleString()}</td><td className="px-3 py-2">{t.type}</td><td className="px-3 py-2">{t.status}</td>
              <td className="px-3 py-2">{t.gateway}</td><td className="px-3 py-2">{t.tran_id}</td><td className="px-3 py-2">{t.amount}</td><td className="px-3 py-2 max-w-[220px]">{t.note}</td>
              <td className="px-3 py-2">{t.type === "REFUND" && t.status === "PENDING" && <Button variant="outline" onClick={() => act(async () => { if (confirm("Mark as refunded? (do this AFTER refunding in the PayWay dashboard)")) { await api(`/api/admin/refunds/${t.id}/done`, { method: "POST", body: {}, token }); await reload(); } })}>Mark refunded</Button>}</td>
            </tr>))}</tbody>
        </table>
      </Card>
    </div>
  );
}

function ProviderLogs({ token }: { token: string | null }) {
  const { data } = useData<any>("/api/admin/provider-logs", token);
  return <LogTable rows={data?.logs?.map((l: any) => ({ at: new Date(l.createdAt).toLocaleString(), provider: l.provider, action: l.action, http: l.statusCode, ms: l.durationMs, error: l.error }))} cols={["at", "provider", "action", "http", "ms", "error"]} />;
}
