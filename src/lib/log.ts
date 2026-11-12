/** Structured JSON logs (searchable in Vercel / any log drain). Never log secrets or full PII. */
export function log(level: "info" | "warn" | "error", msg: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ level, msg, ...data, t: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
