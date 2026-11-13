import { json } from "@/lib/api";
import { getDeps } from "@/lib/deps";
import { env, isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Uptime probe. Reports which integrations are configured (never their values). */
export async function GET() {
  const configured = {
    supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    stripe: !!process.env.STRIPE_SECRET_KEY,
    stripeWebhook: env.stripeWebhookSecrets().length > 0,
    resend: !!process.env.RESEND_API_KEY,
    appSecret: (process.env.APP_SECRET ?? "").length >= 32,
    cronSecret: !!process.env.CRON_SECRET,
    adminPassword: !!process.env.ADMIN_PASSWORD,
  };
  let db = "unknown";
  try {
    await (await getDeps()).store.getSettings();
    db = "ok";
  } catch {
    db = "error";
  }
  const ok = db === "ok";
  return json({ ok, demo: isDemoMode(), db, configured, time: new Date().toISOString() }, ok ? 200 : 503);
}
