/**
 * Centralized, lazily-validated environment access. Missing secrets fail loudly at the call site
 * (never silently fall back in production).
 */
function req(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return v.trim();
}
function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * Demo mode runs the entire product with an in-memory database and simulated Stripe / Resend /
 * storage so it can be clicked through locally with zero credentials. It refuses to run on a
 * Vercel production deployment.
 */
export function isDemoMode(): boolean {
  const on = process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true";
  if (on && process.env.VERCEL_ENV === "production") {
    throw new Error("DEMO_MODE must never be enabled on the production deployment.");
  }
  return on;
}

export const env = {
  siteUrl: () => (opt("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000").replace(/\/$/, ""),
  mainSiteUrl: () => opt("NEXT_PUBLIC_MAIN_SITE_URL") ?? "https://theathletemarket.com",
  supabaseUrl: () => req("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceKey: () => req("SUPABASE_SERVICE_ROLE_KEY"),
  /** Postgres schema holding the marketplace tables (kept apart from the main site's `public`). */
  dbSchema: () => opt("SUPABASE_DB_SCHEMA") ?? "marketplace",
  videoBucket: () => opt("SUPABASE_VIDEO_BUCKET") ?? "marketplace-videos",
  stripeSecretKey: () => req("STRIPE_SECRET_KEY"),
  stripeWebhookSecrets: () =>
    [opt("STRIPE_WEBHOOK_SECRET"), opt("STRIPE_CONNECT_WEBHOOK_SECRET")].filter((s): s is string => !!s),
  resendApiKey: () => req("RESEND_API_KEY"),
  resendWebhookSecret: () => opt("RESEND_WEBHOOK_SECRET"),
  emailFrom: () => opt("EMAIL_FROM") ?? "The Athlete Market <evaluations@theathletemarket.com>",
  emailReplyTo: () => opt("EMAIL_REPLY_TO"),
  adminAlertEmail: () => opt("ADMIN_ALERT_EMAIL"),
  postalAddress: () => opt("COMPANY_POSTAL_ADDRESS") ?? "The Athlete Market",
  twilio: () => {
    const sid = opt("TWILIO_ACCOUNT_SID");
    const token = opt("TWILIO_AUTH_TOKEN");
    const service = opt("TWILIO_MESSAGING_SERVICE_SID");
    const from = opt("TWILIO_FROM_NUMBER");
    return sid && token && (service || from) ? { sid, token, service, from } : null;
  },
  adminAlertPhone: () => opt("ADMIN_ALERT_PHONE"),
  /** TEST MODE: when set, EVERY email goes here instead (parents and coaches) — so you can test both sides safely. */
  testInbox: () => opt("TEST_INBOX")?.trim().toLowerCase() || null,
  /** TEST MODE: every text goes to this phone. With TEST_INBOX set and no TEST_PHONE, texts are skipped. */
  testPhone: () => opt("TEST_PHONE")?.trim() || null,
  appSecret: () => {
    const s = isDemoMode() ? opt("APP_SECRET") ?? "demo-secret-demo-secret-demo-secret!!" : req("APP_SECRET");
    if (s.length < 32) throw new Error("APP_SECRET must be at least 32 characters.");
    return s;
  },
  adminPassword: () => (isDemoMode() ? opt("ADMIN_PASSWORD") ?? "demo-admin" : req("ADMIN_PASSWORD")),
  cronSecret: () => (isDemoMode() ? opt("CRON_SECRET") ?? "demo-cron" : req("CRON_SECRET")),
};
