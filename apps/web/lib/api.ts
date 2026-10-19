/**
 * API base:
 * - Prefer NEXT_PUBLIC_API_URL when set (direct to API service)
 * - Else use same origin (works with next.config rewrites)
 */
export const API = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const url = `${API}${path.startsWith("/") ? path : `/${path}`}`;
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
    throw new ApiError(0, "NETWORK", e?.message || "Network error — check NEXT_PUBLIC_API_URL");
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
