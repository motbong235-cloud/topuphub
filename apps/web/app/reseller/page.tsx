"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogTable } from "@/components/LogTable";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/useData";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const TABS = ["overview", "webhook", "orders", "api-logs"] as const;

const SIGN_EXAMPLE = (base: string, key: string) => `# Sign + create an order (bash + openssl)
KEY="${key}"; SECRET="sk_...your secret..."
BODY='{"product":"mlbb-86","target":"123456789","server_id":"1234","reference":"my-order-1"}'
TS=$(date +%s)
BODY_SHA=$(printf '%s' "$BODY" | openssl dgst -sha256 -hex | awk '{print $2}')
SIG=$(printf '%s\\n%s\\n%s\\n%s' "$TS" "POST" "/api/v1/reseller/orders" "$BODY_SHA" \\
  | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')
curl -X POST "${base}/orders" -H "Content-Type: application/json" \\
  -H "X-API-KEY: $KEY" -H "X-TIMESTAMP: $TS" -H "X-SIGNATURE: $SIG" \\
  -H "X-IDEMPOTENCY-KEY: order-$(date +%s%N)" -d "$BODY"`;

export default function ResellerPage() {
  const { t } = useI18n();
  const { token, user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("overview");
  const me = useData<any>(token ? "/api/reseller-portal/me" : null, token);
  const orders = useData<any>(token && tab === "orders" ? "/api/reseller-portal/orders" : null, token);
  const logs = useData<any>(token && tab === "api-logs" ? "/api/reseller-portal/api-logs" : null, token);
  const hooks = useData<any>(token && tab === "webhook" ? "/api/reseller-portal/webhook-logs" : null, token);
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [amount, setAmount] = useState("10");
  const [msg, setMsg] = useState("");

  if (authLoading) return <p>{t("loading")}</p>;
  if (!user) return <Link href="/login?next=/reseller" className="text-brand-600 underline">{t("login")}</Link>;
  if (me.error) return <p className="text-red-600">{me.error}</p>;
  if (!me.data) return <p>{t("loading")}</p>;
  const r = me.data;

  async function act(fn: () => Promise<void>) { setMsg(""); try { await fn(); } catch (e: any) { setMsg(e.message); } }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {TABS.map((x) => (
          <button key={x} onClick={() => setTab(x)} className={cn("rounded-full border px-3 py-1 text-sm", tab === x ? "border-brand-600 bg-brand-600 text-white" : "bg-white")}>{x}</button>
        ))}
      </div>
      {msg && <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">{msg}</p>}
      {secret && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold">{secret.label} — shown only once, copy it now:</p>
          <code className="mt-1 block break-all rounded bg-white p-2 text-xs">{secret.value}</code>
          <Button variant="outline" className="mt-2" onClick={() => setSecret(null)}>OK</Button>
        </Card>
      )}

      {tab === "overview" && (
        <>
          <Card className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-slate-500">{t("balance")}</span><span className="text-2xl font-extrabold text-brand-600">${r.balance}</span></div>
            <div className="flex gap-2">
              <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="max-w-[120px]" />
              <Button onClick={() => act(async () => {
                const c = await api<any>("/api/reseller-portal/topup", { token, body: { amount: Number(amount) } });
                window.location.href = `/pay/${c.tranId}`;
              })}>{t("topup")}</Button>
            </div>
          </Card>
          <Card className="space-y-2 text-sm">
            <div><span className="text-slate-500">API key: </span><code className="break-all">{r.api_key}</code></div>
            <div><span className="text-slate-500">Base URL: </span><code className="break-all">{r.base_url}</code></div>
            <div><span className="text-slate-500">Rate limit: </span>{r.rate_limit_per_min}/min</div>
            <Button variant="outline" onClick={() => act(async () => { const x = await api<any>("/api/reseller-portal/rotate-secret", { method: "POST", body: {}, token }); setSecret({ label: "New API secret", value: x.api_secret }); })}>
              Rotate API secret
            </Button>
          </Card>
          <Card><pre className="overflow-x-auto whitespace-pre-wrap text-xs">{SIGN_EXAMPLE(r.base_url, r.api_key)}</pre></Card>
        </>
      )}

      {tab === "webhook" && (
        <>
          <Card className="space-y-3">
            <div><Label>Webhook URL (https)</Label><Input value={url ?? r.webhook_url ?? ""} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-server.com/topuphub-webhook" /></div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => act(async () => { await api("/api/reseller-portal/webhook", { method: "PUT", token, body: { url: (url ?? r.webhook_url ?? "") || null } }); await me.reload(); setMsg("Saved"); })}>{t("save")}</Button>
              <Button variant="outline" onClick={() => act(async () => { const x = await api<any>("/api/reseller-portal/webhook/test", { method: "POST", body: {}, token }); setMsg(x.delivered ? "Test delivered" : "Failed"); await hooks.reload(); })}>Send test</Button>
              <Button variant="outline" onClick={() => act(async () => { const x = await api<any>("/api/reseller-portal/rotate-webhook-secret", { method: "POST", body: {}, token }); setSecret({ label: "New webhook secret", value: x.webhook_secret }); })}>Rotate webhook secret</Button>
            </div>
          </Card>
          <LogTable rows={hooks.data?.logs} cols={["at", "event", "status", "success", "attempt", "error"]} />
        </>
      )}

      {tab === "orders" && <LogTable rows={orders.data?.orders?.map((o: any) => ({ code: o.code, product: o.product.name, target: o.target, amount: o.amount, status: o.status, reference: o.reference }))} cols={["code", "product", "target", "amount", "status", "reference"]} />}
      {tab === "api-logs" && <LogTable rows={logs.data?.logs} cols={["at", "method", "path", "status", "ms", "ip"]} />}
    </div>
  );
}
