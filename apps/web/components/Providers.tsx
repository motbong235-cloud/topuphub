"use client";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
export const Providers = ({ children }: { children: ReactNode }) => (
  <I18nProvider><AuthProvider>{children}</AuthProvider></I18nProvider>
);
