"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

/** GET helper with reload(). Pass token=undefined to wait until auth is ready. */
export function useData<T = any>(path: string | null, token?: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) return;
    try { setData(await api<T>(path, { token })); setError(null); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [path, token]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load };
}
