import { notFound, redirect } from "next/navigation";
import { Notice } from "@/components/ui";
import { env } from "@/lib/env";
import { money } from "@/lib/format";
import { resolvePayoutsLink } from "@/lib/services/access";
import { retryPayoutsForCoach, startOnboarding, syncAccount } from "@/lib/services/lifecycle";
import { getDeps } from "@/lib/server";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ token: string }>; searchParams: Promise<{ returned?: string }> };

export default async function PayoutsPage({ params, searchParams }: P) {
  const { token } = await params;
  const { returned } = await searchParams;
  const deps = await getDeps();
  let coach = await resolvePayoutsLink(deps, token);
  if (!coach) notFound();
  if (coach.stripe_account_id) coach = await syncAccount(deps, coach);
  if (returned && coach.stripe_transfers_active) await retryPayoutsForCoach(deps, coach.id);

  const owed = (await deps.store.listRequests({ coach_id: coach.id, status: ["completed"] }))
    .filter((r) => r.payout_status !== "paid" && r.payout_status !== "reversed")
    .reduce((s, r) => s + r.coach_payout_cents, 0);
  const ready = coach.stripe_transfers_active && coach.stripe_details_submitted;

  async function continueToStripe() {
    "use server";
    const d = await getDeps();
    const c = await resolvePayoutsLink(d, token);
    if (!c) return;
    const base = `${env.siteUrl()}/coach/payouts/${token}`;
    const link = ready && c.stripe_account_id
      ? await d.payments.createDashboardLink(c.stripe_account_id)
      : await startOnboarding(d, c, { refreshUrl: base, returnUrl: `${base}?returned=1` });
    redirect(link.url);
  }

  return (
    <div className="card space-y-5 p-6">
      <div>
        <p className="text-sm text-muted">Payouts for</p>
        <h1 className="text-2xl font-bold">{coach.full_name}</h1>
      </div>
      {ready ? (
        <Notice tone="success" title="You're all set">
          Payouts are active. Earnings are sent automatically after each delivered evaluation and reach your bank on Stripe&apos;s payout schedule.
        </Notice>
      ) : coach.stripe_details_submitted ? (
        <Notice tone="warn" title="Stripe is verifying your details">Usually a few minutes. We&apos;ll send your payment automatically once Stripe finishes.</Notice>
      ) : (
        <p className="text-[15px] leading-relaxed text-muted">
          To get paid, complete a one-time secure setup with <strong className="text-navy">Stripe</strong>, our payments partner. Stripe verifies your identity and
          collects your bank details directly — The Athlete Market never sees your bank login or account number.
        </p>
      )}
      {owed > 0 && !ready && (
        <div className="rounded-xl bg-surface p-4"><p className="text-sm text-muted">Waiting for you</p><p className="text-3xl font-bold">{money(owed)}</p></div>
      )}
      <form action={continueToStripe}>
        <button className="btn-primary w-full">{ready ? "Open my Stripe payouts dashboard" : coach.stripe_account_id ? "Continue Stripe setup" : "Set up payouts with Stripe"}</button>
      </form>
      {!ready && <p className="text-xs text-subtle">Takes about 3 minutes. You&apos;ll need your legal name, date of birth, SSN last 4 (or full, if Stripe asks) and bank details.</p>}
    </div>
  );
}
