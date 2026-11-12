import type { Deps } from "../deps";
import type { EvalRequest } from "../types";

export interface Metrics {
  windowDays: number;
  coachViews: number;
  formViews: number;
  checkoutsStarted: number;
  paid: number;
  checkoutConversion: number | null;
  notified: number;
  accepted: number;
  completed: number;
  declined: number;
  expired: number;
  refunded: number;
  acceptanceRate: number | null;
  completionRate: number | null;
  refundRate: number | null;
  medianHoursToDeliver: number | null;
  gmvCents: number;
  netGmvCents: number;
  platformRevenueCents: number;
  stripeFeesCents: number;
  refundFeeLossCents: number;
  coachPayoutsCents: number;
  contributionMarginCents: number;
  customers: number;
  repeatCustomers: number;
  repeatRate: number | null;
  marketingSpendCents: number;
  cacCents: number | null;
  pendingPayoutCents: number;
  blockedPayouts: number;
  failedRefunds: number;
  openDisputes: number;
}

const PAID_STATES = new Set(["paid", "coach_notified", "accepted", "submitted", "completed", "declined", "expired", "refunded"]);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export async function computeMetrics(deps: Deps, windowDays = 30): Promise<Metrics> {
  const since = new Date(deps.now().getTime() - windowDays * 86_400_000).toISOString();
  const all = await deps.store.listRequests({ limit: 20000 });
  const inWindow = all.filter((r) => r.created_at >= since);
  const paid = inWindow.filter((r) => PAID_STATES.has(r.status) && r.paid_at);
  const reached = (r: EvalRequest) => !!r.coach_notified_at;
  const notified = paid.filter(reached);
  const accepted = notified.filter((r) => r.accepted_at);
  const completed = paid.filter((r) => r.completed_at);
  const refunded = paid.filter((r) => r.status === "refunded");
  const deliverHours = completed
    .map((r) => (Date.parse(r.completed_at!) - Date.parse(r.paid_at!)) / 3_600_000)
    .sort((a, b) => a - b);

  const gmv = paid.reduce((s, r) => s + r.price_cents, 0);
  const refundedAmt = refunded.reduce((s, r) => s + r.price_cents, 0);
  const stripeFees = paid.reduce((s, r) => s + (r.stripe_fee_cents ?? Math.round(r.price_cents * 0.029) + 30), 0);
  const refundFeeLoss = refunded.reduce((s, r) => s + (r.stripe_fee_cents ?? Math.round(r.price_cents * 0.029) + 30), 0);
  const kept = completed.filter((r) => r.status === "completed");
  const platformRevenue = kept.reduce((s, r) => s + r.platform_fee_cents, 0);
  const coachPayouts = kept.filter((r) => r.payout_status === "paid").reduce((s, r) => s + r.coach_payout_cents, 0);

  // Customers (lifetime, by purchaser email)
  const byCustomer = new Map<string, number>();
  for (const r of all) if (r.paid_at) byCustomer.set(r.purchaser_email.toLowerCase(), (byCustomer.get(r.purchaser_email.toLowerCase()) ?? 0) + 1);
  const newCustomersInWindow = new Set<string>();
  const firstPaid = new Map<string, string>();
  for (const r of [...all].filter((x) => x.paid_at).sort((a, b) => a.paid_at!.localeCompare(b.paid_at!))) {
    const k = r.purchaser_email.toLowerCase();
    if (!firstPaid.has(k)) firstPaid.set(k, r.paid_at!);
  }
  for (const [k, t] of firstPaid) if (t >= since) newCustomersInWindow.add(k);

  const spend = await deps.store.listMarketingSpend();
  const spendInWindow = spend.filter((s) => s.month >= since.slice(0, 7) + "-01").reduce((a, s) => a + s.amount_cents, 0);
  const disputes = await deps.store.listDisputes();

  const [coachViews, formViews, checkoutsStarted] = await Promise.all([
    deps.store.countAnalytics("coach_view", since),
    deps.store.countAnalytics("form_view", since),
    deps.store.countAnalytics("checkout_started", since),
  ]);

  return {
    windowDays,
    coachViews,
    formViews,
    checkoutsStarted,
    paid: paid.length,
    checkoutConversion: ratio(paid.length, checkoutsStarted),
    notified: notified.length,
    accepted: accepted.length,
    completed: completed.length,
    declined: paid.filter((r) => r.declined_at).length,
    expired: paid.filter((r) => r.expired_at).length,
    refunded: refunded.length,
    acceptanceRate: ratio(accepted.length, notified.length),
    completionRate: ratio(completed.length, notified.length),
    refundRate: ratio(refunded.length, paid.length),
    medianHoursToDeliver: deliverHours.length ? deliverHours[Math.floor(deliverHours.length / 2)]! : null,
    gmvCents: gmv,
    netGmvCents: gmv - refundedAmt,
    platformRevenueCents: platformRevenue,
    stripeFeesCents: stripeFees,
    refundFeeLossCents: refundFeeLoss,
    coachPayoutsCents: coachPayouts,
    // Platform keeps commission, pays all Stripe fees (incl. on refunded charges, which Stripe doesn't return).
    contributionMarginCents: platformRevenue - stripeFees,
    customers: byCustomer.size,
    repeatCustomers: [...byCustomer.values()].filter((n) => n >= 2).length,
    repeatRate: ratio([...byCustomer.values()].filter((n) => n >= 2).length, byCustomer.size),
    marketingSpendCents: spendInWindow,
    cacCents: newCustomersInWindow.size ? Math.round(spendInWindow / newCustomersInWindow.size) : null,
    pendingPayoutCents: all.filter((r) => r.status === "completed" && ["pending", "blocked", "failed", "processing"].includes(r.payout_status)).reduce((s, r) => s + r.coach_payout_cents, 0),
    blockedPayouts: all.filter((r) => r.status === "completed" && r.payout_status === "blocked").length,
    failedRefunds: all.filter((r) => r.refund_status === "failed").length,
    openDisputes: disputes.filter((d) => !["won", "lost", "warning_closed"].includes(d.status)).length,
  };
}
