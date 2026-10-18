type Level = "info" | "warn" | "error";
function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(meta ?? {}) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}
export const logger = {
  info: (m: string, x?: Record<string, unknown>) => log("info", m, x),
  warn: (m: string, x?: Record<string, unknown>) => log("warn", m, x),
  error: (m: string, x?: Record<string, unknown>) => log("error", m, x),
};
