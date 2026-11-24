import { json } from "@/lib/api";
import { getDeps } from "@/lib/deps";
import { env, isDemoMode, paymentsOff } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Uptime probe. Reports which integrations are configured (never their values). */
export async function GET() {
  const configured = {
    supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    stripe: !!process.env.STRIPE_SECRET_KEY,
    stripeWebhook: env.stripeWebhookSecrets().length > 0,
    resend: !!process.env.RESEND_API_KEY,
    twilio: !!env.twilio(),
    inboundEmail: !!process.env.INBOUND_WEBHOOK_SECRET,
    appSecret: (process.env.APP_SECRET ?? "").length >= 32,
    cronSecret: !!process.env.CRON_SECRET,
    adminPassword: !!process.env.ADMIN_PASSWORD,
  };
  // Mode only (never the key): lets uptime checks and ops confirm test vs live payments at a glance.
  const sk = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const stripeMode = /^(sk|rk)_live_/.test(sk) ? "live" : /^(sk|rk)_test_/.test(sk) ? "test" : sk ? "unknown" : null;
  let db = "unknown";
  let pendingMigrations: string[] = [];
  try {
    const { store } = await getDeps();
    await store.getSettings();
    db = "ok";
    pendingMigrations = (await store.pendingMigrations?.().catch(() => [])) ?? [];
  } catch {
    db = "error";
  }
  const ok = db === "ok";
  return json({ ok, demo: isDemoMode(), db, configured, stripeMode, paymentsOff: paymentsOff(), testInbox: !!env.testInbox(), pendingMigrations, time: new Date().toISOString() }, ok ? 200 : 503);
}
