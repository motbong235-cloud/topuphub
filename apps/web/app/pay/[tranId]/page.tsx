"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

/** Hosted checkout bridge: loads the signed PayWay form from our API and POSTs the browser to PayWay (QR / ABA PAY / card). */
export default function PayPage() {
  const { tranId } = useParams<{ tranId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { token } = useAuth();
  const [form, setForm] = useState<any>(null);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    api(`/api/payments/checkout/${tranId}`).then(setForm).catch((e) => setErr(e.message));
  }, [tranId]);

  useEffect(() => {
    if (form && !form.simulation) ref.current?.submit(); // auto-redirect to PayWay
  }, [form]);

  async function simulate() {
    try {
      await api(`/api/payments/simulate/${tranId}/confirm`, { method: "POST", body: {}, token });
      router.push(form.orderCode ? `/orders/${form.orderCode}` : "/reseller");
    } catch (e: any) { setErr(e.message); }
  }

  if (err) return <p className="text-red-600">{err}</p>;
  if (!form) return <p>{t("loading")}</p>;

  return (
    <Card className="mx-auto max-w-md space-y-3 text-center">
      {form.simulation ? (
        <>
          <p className="text-sm text-amber-700">PAYMENT_SIMULATION is ON (no real money)</p>
          <p className="text-2xl font-extrabold">${form.amount}</p>
          <Button onClick={simulate}>{t("simulate")}</Button>
        </>
      ) : (
        <>
          <p>{t("redirecting")}</p>
          <p className="text-xs text-slate-500">{t("payHint")}</p>
          <form ref={ref} action={form.action} method={form.method}>
            {Object.entries(form.fields as Record<string, string>).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <Button type="submit">{t("continuePay")}</Button>
          </form>
        </>
      )}
    </Card>
  );
}
