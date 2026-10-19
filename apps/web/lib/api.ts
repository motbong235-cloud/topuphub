/**
 * Prefer NEXT_PUBLIC_API_URL (direct to API).
 * Fallback: same-origin (Next rewrites) then known Render API host.
 */
function resolveApiBase() {
  const fromEnv = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  // Browser: try same-origin first (works if next.config rewrites are active)
  if (typeof window !== "undefined") {
    // If pages are on topuphub-web, call API host directly when rewrite missing
    if (window.location.hostname.includes("topuphub-web")) {
      return "https://topuphub-api.onrender.com";
    }
    return ""; // relative
  }
  return "";
}

export const API = resolveApiBase();

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const base = resolveApiBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: {
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch (e: any) {
    throw new ApiError(0, "NETWORK", e?.message || "Network error — set NEXT_PUBLIC_API_URL to API host");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? "ERROR",
      data?.error?.message ?? (res.status === 404 ? `404 Not Found: ${path}` : `HTTP ${res.status}`),
    );
  }
  return data as T;
}
