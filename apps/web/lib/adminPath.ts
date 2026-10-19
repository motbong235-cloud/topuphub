/** Public admin URL segment — change via NEXT_PUBLIC_ADMIN_PATH (default th-console) */
export const ADMIN_PATH = (process.env.NEXT_PUBLIC_ADMIN_PATH || "th-console").replace(/^\/+|\/+$/g, "");
export const adminHref = (sub = "") => `/${ADMIN_PATH}${sub ? `/${sub}` : ""}`;
