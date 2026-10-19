"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "RESELLER" | "ADMIN";
}
interface AuthCtx {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (adminToken: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("th_token");
    if (!t) {
      setLoading(false);
      return;
    }
    api<{ user: User }>("/api/auth/me", { token: t })
      .then((r) => {
        setUser(r.user);
        setToken(t);
      })
      .catch(() => localStorage.removeItem("th_token"))
      .finally(() => setLoading(false));
  }, []);

  const finish = (r: { token: string; user: User }) => {
    localStorage.setItem("th_token", r.token);
    setToken(r.token);
    setUser(r.user);
  };
  const login = useCallback(
    async (email: string, password: string) => finish(await api("/api/auth/login", { body: { email, password } })),
    [],
  );
  /** Admin panel: ADMIN_TOKEN only (no email/password). */
  const loginWithToken = useCallback(async (adminToken: string) => {
    const r = await api<{ token: string; user: User }>("/api/auth/admin-login", {
      body: { token: adminToken },
    });
    finish(r);
  }, []);
  const register = useCallback(
    async (email: string, password: string, name?: string) =>
      finish(await api("/api/auth/register", { body: { email, password, name } })),
    [],
  );
  const logout = useCallback(() => {
    localStorage.removeItem("th_token");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, token, loading, login, loginWithToken, register, logout }}>{children}</Ctx.Provider>
  );
}
export const useAuth = () => useContext(Ctx);
