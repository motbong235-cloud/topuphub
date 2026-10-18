import { cn } from "@/lib/utils";
const tone: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-800", PAID: "bg-blue-100 text-blue-800", PROCESSING: "bg-indigo-100 text-indigo-800",
  PENDING_PAYMENT: "bg-amber-100 text-amber-800", PENDING: "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-800", REFUNDED: "bg-slate-200 text-slate-700",
};
export const Badge = ({ value, label }: { value: string; label?: string }) => (
  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", tone[value] ?? "bg-slate-100 text-slate-700")}>{label ?? value}</span>
);
