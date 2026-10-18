"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function PayPage() {
  const { tranId } = useParams<{ tranId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { token } = useAuth();
  const [form, setForm] = useState<any>(null);
  const [err, setErr] = useState("");
  const [polling, setPolling] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    api(`/api/payments/checkout/${tranId}`)
      .then(setForm)
      .catch((e) => setErr(e.message));
  }, [tranId]);

  // Auto-submit PayWay form
  useEffect(() => {
    if (form?.mode === "payway_form" && !form.simulation) {
      ref.current?.submit();
    }
  }, [form]);

  // Poll Khmer System QR until paid
  useEffect(() => {
    if (!form || form.mode !== "khmer_system_qr" || form.paid || form.simulation) return;
    setPolling(true);
    const id = setInterval(async () => {
      try {
        const r = await api(`/api/payments/poll/${tranId}`);
        if (r.paid) {
          clearInterval(id);
          setPolling(false);
          router.push(form.orderCode ? `/orders/${form.orderCode}` : "/orders");
        }
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, [form, tranId, router]);

  async function simulate() {
    try {
      await api(`/api/payments/simulate/${tranId}/confirm`, { method: "POST", body: {}, token });
      router.push(form.orderCode ? `/orders/${form.orderCode}` : "/reseller");
    } catch (e: any) {
      setErr(e.message);
    }
  }

  if (err) return <p className="text-center text-red-600">{err}</p>;
  if (!form) return <p className="text-center text-slate-500">{t("loading")}</p>;

  return (
    <Card className="mx-auto max-w-md space-y-4 border-slate-200 p-6 text-center shadow-soft">
      <div className="text-xs font-bold uppercase tracking-wide text-brand-600">
        {form.gateway === "khmer_system" ? "Khmer System · KHQR" : form.gateway === "payway" ? "ABA PayWay" : "Payment"}
      </div>
      <p className="text-3xl font-black text-brand-600">${form.amount}</p>
      {form.orderCode && <p className="text-xs text-slate-500">Order {form.orderCode}</p>}

      {form.simulation ? (
        <>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">PAYMENT_SIMULATION is ON</p>
          <Button onClick={simulate}>{t("simulate")}</Button>
        </>
      ) : form.mode === "khmer_system_qr" ? (
        <>
          {form.qr_image ? (
            <img
              src={form.qr_image.startsWith("data:") || form.qr_image.startsWith("http") ? form.qr_image : `data:image/png;base64,${form.qr_image}`}
              alt="KHQR"
              className="pay-qr"
            />
          ) : (
            <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 text-slate-400">
              KHQR
            </div>
          )}
          <p className="text-sm font-semibold text-slate-700">ស្កេន KHQR តាមកម្មវិធីធនាគារ</p>
          <p className="text-xs text-slate-500">{polling ? "កំពុងរង់ចាំការទូទាត់…" : t("payHint") || "Scan to pay"}</p>
          <Button
            variant="outline"
            onClick={async () => {
              const r = await api(`/api/payments/poll/${tranId}`);
              if (r.paid) router.push(form.orderCode ? `/orders/${form.orderCode}` : "/orders");
            }}
          >
            ខ្ញុំបានបង់ហើយ · Check
          </Button>
        </>
      ) : (
        <>
          <p>{t("redirecting")}</p>
          <p className="text-xs text-slate-500">{t("payHint")}</p>
          <form ref={ref} action={form.action} method={form.method}>
            {Object.entries((form.fields || {}) as Record<string, string>).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <Button type="submit">{t("continuePay")}</Button>
          </form>
        </>
      )}
    </Card>
  );
}
