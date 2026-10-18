import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";
export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-xl border border-slate-200 bg-white p-4 shadow-sm", className)} {...p} />
);
