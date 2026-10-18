import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn("w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100", className)} {...p} />
);
export const Label = ({ children }: { children: React.ReactNode }) => <label className="mb-1 block text-xs font-semibold text-slate-600">{children}</label>;
