import { AdminForm } from "@/components/admin-ui";
import { Notice } from "@/components/ui";
import { SPORTS } from "@/lib/constants";
import { env, isDemoMode, paymentsOff } from "@/lib/env";
import { getDeps } from "@/lib/server";
import { createTestSchool, removeTestSchool } from "../../actions";

export const dynamic = "force-dynamic";

type Check = { label: string; ok: boolean | "warn"; detail: string; fix?: string };
const has = (k: string) => !!process.env[k]?.trim();

/** Plain-English launch checklist: what's set up, what's missing, and where to fix it. */
export default async function Launch() {
  const deps = await getDeps();
  let dbOk = false, dbErr = "";
  try { await deps.store.getSettings(); dbOk = true; } catch (e) { dbErr = String(e).slice(0, 160); }
  const sk = process.env.STRIPE_SECRET_KEY ?? "";
  const stripeMode = sk.startsWith("sk_live_") || sk.startsWith("rk_live_") ? "live" : sk.startsWith("sk_test_") || sk.startsWith("rk_test_") ? "test" : null;
  const from = env.emailFrom();
  const site = env.siteUrl();
  const testInbox = env.testInbox();

  const checks: Check[] = [
    { label: "Website address", ok: !site.includes("localhost"), detail: site, fix: "Vercel → Settings → Environment Variables → NEXT_PUBLIC_SITE_URL = your site's https address, then Redeploy." },
    { label: "Database (Supabase)", ok: isDemoMode() ? "warn" : dbOk, detail: isDemoMode() ? "Demo mode — using a temporary in-memory database" : dbOk ? "Connected to the marketplace schema" : dbErr, fix: "Run supabase/setup.sql, add 'marketplace' to Exposed schemas, and set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY." },
    { label: "Payments (Stripe)", ok: paymentsOff() ? "warn" : stripeMode === "live" ? true : stripeMode === "test" ? "warn" : false, detail: paymentsOff() ? "OFF — messages are free, no card step, coaches aren't paid. Add the Stripe key when you're ready to charge." : stripeMode === "live" ? "LIVE — real cards are charged" : stripeMode === "test" ? "TEST mode — use card 4242 4242 4242 4242, nothing is really charged" : "No Stripe key", fix: "Stripe → Developers → API keys → STRIPE_SECRET_KEY." },
    { label: "Stripe webhook", ok: paymentsOff() ? "warn" : has("STRIPE_WEBHOOK_SECRET"), detail: paymentsOff() ? "Not needed while payments are off" : has("STRIPE_WEBHOOK_SECRET") ? "Set" : "Missing — orders won't be sent after checkout", fix: `Stripe → Developers → Webhooks → Add endpoint: ${site}/api/stripe/webhook → copy the signing secret → STRIPE_WEBHOOK_SECRET.` },
    { label: "Email sending (Resend)", ok: has("RESEND_API_KEY"), detail: has("RESEND_API_KEY") ? `Sending as ${from}` : "No Resend key — no emails will go out", fix: "Resend → API Keys → Create → RESEND_API_KEY." },
    { label: "Your own email domain", ok: from.includes("resend.dev") ? "warn" : has("RESEND_API_KEY"), detail: from.includes("resend.dev") ? "Using Resend's test sender — can only email YOUR address. Fine for testing." : "Using your domain (must be verified in Resend)", fix: "Resend → Domains → add theathletemarket.com → add the DNS records it shows → EMAIL_FROM = Coach Line <line@theathletemarket.com>." },
    { label: "Texts (Twilio)", ok: env.twilio() ? true : "warn", detail: env.twilio() ? "Connected" : "Optional — email still works without it", fix: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID." },
    { label: "Email replies (Postmark inbound)", ok: has("INBOUND_WEBHOOK_SECRET") ? true : "warn", detail: has("INBOUND_WEBHOOK_SECRET") ? "Set" : "Optional for first test — the one-tap answer buttons work without it. Needed for coach/parent email replies and the Gmail option.", fix: "See docs/DEPLOYMENT.md §3a-2." },
    { label: "Timed jobs (reminders, pass-to-next-coach)", ok: has("CRON_SECRET") ? true : "warn", detail: has("CRON_SECRET") ? "Set — schedule it in Supabase (supabase/cron.sql)" : "Missing", fix: "CRON_SECRET = any long random text, then run supabase/cron.sql." },
    { label: "Security keys", ok: has("APP_SECRET") && has("ADMIN_PASSWORD"), detail: has("APP_SECRET") && has("ADMIN_PASSWORD") ? "Set" : "APP_SECRET or ADMIN_PASSWORD missing", fix: "APP_SECRET = 40+ random characters; ADMIN_PASSWORD = your admin password." },
  ];
  const icon = (ok: Check["ok"]) => (ok === true ? "✅" : ok === "warn" ? "🟡" : "❌");
  const ready = checks.filter((c) => c.ok === false).length === 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section className="card p-5">
        <h1 className="text-xl font-bold">Launch checklist</h1>
        <p className="mt-1 text-sm text-muted">Green = done. Yellow = fine for testing. Red = needed before anything works.</p>
        <div className="mt-4">
          {testInbox
            ? <Notice tone="warn" title="Test mode is ON">Every email goes to <strong>{testInbox}</strong>{env.testPhone() ? <> and every text to <strong>{env.testPhone()}</strong></> : " (texts are skipped)"}. No real coach or parent is contacted. Remove TEST_INBOX in Vercel when you&apos;re ready to go live.</Notice>
            : <Notice tone={stripeMode === "live" ? "success" : "warn"} title={stripeMode === "live" ? "Live" : "Test inbox is off"}>{stripeMode === "live" ? "Real emails go to real coaches and real cards are charged." : "Emails go to the real addresses. Set TEST_INBOX to your email while testing."}</Notice>}
        </div>
        <ul className="mt-4 divide-y divide-line">
          {checks.map((c) => (
            <li key={c.label} className="py-3">
              <p className="font-semibold">{icon(c.ok)} {c.label}</p>
              <p className="break-words text-sm text-muted">{c.detail}</p>
              {c.ok !== true && c.fix && <p className="mt-1 text-xs text-navy">How to fix: {c.fix}</p>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm font-semibold">{ready ? "🚀 Ready to test end to end." : "Fix the red items, then refresh this page."}</p>
      </section>

      <div className="space-y-6">
        <AdminForm action={createTestSchool} submit="Create my test school" className="card p-5">
          <h2 className="text-lg font-bold">Test it as the coach</h2>
          <p className="text-sm text-muted">Creates <strong>Athlete Market Test University</strong> with <strong>you</strong> as the recruiting coordinator{testInbox ? ", plus two placeholder coaches so you can test “pass it on”" : ""}. Then message it from the homepage with your own email.</p>
          <div><label className="label" htmlFor="tn">Your name</label><input id="tn" name="name" className="field" placeholder="Coach Chase" /></div>
          <div><label className="label" htmlFor="te">Your email (coach side)</label><input id="te" name="email" type="email" className="field" defaultValue={testInbox ?? ""} /></div>
          <div><label className="label" htmlFor="tp">Your mobile (optional, for coach texts)</label><input id="tp" name="phone" type="tel" className="field" defaultValue={env.testPhone() ?? ""} /></div>
          <div><label className="label" htmlFor="ts">Sport</label>
            <select id="ts" name="sport" className="field" defaultValue="Basketball (M)">{SPORTS.map((s) => <option key={s}>{s}</option>)}</select></div>
        </AdminForm>
        <AdminForm action={removeTestSchool} submit="Hide test school" className="card p-5">
          <h2 className="text-lg font-bold">Done testing?</h2>
          <p className="text-sm text-muted">Hides Athlete Market Test University so families never see it.</p>
        </AdminForm>
      </div>
    </div>
  );
}
