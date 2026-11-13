import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { Pill } from "@/components/status";
import { computeMetrics } from "@/lib/services/analytics";
import { dateTime, money } from "@/lib/format";
import { getDeps } from "@/lib/server";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin();
  const days = Math.min(3650, Math.max(1, Number((await searchParams).days) || 30));
  const deps = await getDeps();
  const [m, lifetime, recent, pendingCoaches] = await Promise.all([
    computeMetrics(deps, days),
    computeMetrics(deps, 3650),
    deps.store.listRequests({ limit: 8 }),
    deps.store.listCoachesAdmin({ eligibility: "pending_review", limit: 50 }),
  ]);
  const coaches = new Map((await Promise.all([...new Set(recent.map((r) => r.coach_id))].map((id) => deps.store.getCoach(id)))).filter(Boolean).map((c) => [c!.id, c!]));

  const alerts = [
    m.failedRefunds && { tone: "red", text: `${m.failedRefunds} refund(s) failed`, href: "/admin/finance" },
    m.openDisputes && { tone: "red", text: `${m.openDisputes} open dispute(s)`, href: "/admin/finance" },
    m.blockedPayouts && { tone: "amber", text: `${m.blockedPayouts} payout(s) blocked (usually waiting on coach Stripe setup)`, href: "/admin/finance" },
    pendingCoaches.length && { tone: "amber", text: `${pendingCoaches.length} evaluator application(s) awaiting review`, href: "/admin/coaches?eligibility=pending_review" },
  ].filter(Boolean) as { tone: string; text: string; href: string }[];

  const toHundred = Math.min(100, lifetime.paid);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Overview</h1>
        <div className="flex gap-1 rounded-xl bg-white p-1 ring-1 ring-line">
          {[7, 30, 90, 3650].map((d) => (
            <Link key={d} href={`/admin?days=${d}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${d === days ? "bg-navy text-white" : "text-muted"}`}>
              {d === 3650 ? "All" : `${d}d`}
            </Link>
          ))}
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Link key={a.text} href={a.href} className={`block rounded-xl px-4 py-3 text-sm font-medium ring-1 ${a.tone === "red" ? "bg-danger-50 text-[#7a1717] ring-[#f3c4c4]" : "bg-warn-50 text-[#6b3d00] ring-[#f5dcb5]"}`}>
              {a.text} →
            </Link>
          ))}
        </div>
      )}

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Validation: first 100 paid evaluations</h2>
          <span className="text-sm font-semibold">{toHundred}/100</span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-blue" style={{ width: `${toHundred}%` }} /></div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Target label="Checkout conversion" value={pct(lifetime.checkoutConversion)} target="≥ 35%" ok={(lifetime.checkoutConversion ?? 0) >= 0.35} />
          <Target label="Coach completion" value={pct(lifetime.completionRate)} target="≥ 80%" ok={(lifetime.completionRate ?? 0) >= 0.8} />
          <Target label="Refund rate" value={pct(lifetime.refundRate)} target="≤ 15%" ok={lifetime.refundRate != null && lifetime.refundRate <= 0.15} />
          <Target label="Repeat purchase" value={pct(lifetime.repeatRate)} target="≥ 20%" ok={(lifetime.repeatRate ?? 0) >= 0.2} />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="GMV" value={money(m.gmvCents)} sub={`Net of refunds ${money(m.netGmvCents)}`} />
        <Kpi label="Platform revenue" value={money(m.platformRevenueCents)} sub="Commission on delivered" />
        <Kpi label="Contribution margin" value={money(m.contributionMarginCents)} sub={`Stripe fees ${money(m.stripeFeesCents)} (refunded charges: ${money(m.refundFeeLossCents)})`} />
        <Kpi label="CAC" value={m.cacCents == null ? "—" : money(m.cacCents)} sub={`Spend ${money(m.marketingSpendCents)}`} />
        <Kpi label="Paid requests" value={String(m.paid)} sub={`${m.checkoutsStarted} checkouts started`} />
        <Kpi label="Acceptance" value={pct(m.acceptanceRate)} sub={`${m.accepted}/${m.notified} notified`} />
        <Kpi label="Completion" value={pct(m.completionRate)} sub={`Median ${m.medianHoursToDeliver == null ? "—" : `${m.medianHoursToDeliver.toFixed(1)}h`} to deliver`} />
        <Kpi label="Refunds" value={pct(m.refundRate)} sub={`${m.declined} declined · ${m.expired} expired`} />
        <Kpi label="Customers" value={String(m.customers)} sub={`${m.repeatCustomers} repeat (${pct(m.repeatRate)})`} />
        <Kpi label="Coach payouts" value={money(m.coachPayoutsCents)} sub={`${money(m.pendingPayoutCents)} owed / pending`} />
        <Kpi label="Profile views" value={String(m.coachViews)} sub={`${m.formViews} form views`} />
        <Kpi label="View → paid" value={pct(m.coachViews ? m.paid / m.coachViews : null)} sub="Profile view to payment" />
      </section>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between p-4"><h2 className="font-semibold">Recent requests</h2><Link href="/admin/requests" className="text-sm font-semibold text-blue">All →</Link></div>
        <table className="table-admin">
          <thead><tr><th>Ref</th><th>Athlete</th><th>Coach</th><th>Status</th><th>Payout</th><th>Amount</th><th>Created</th></tr></thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <td><Link className="font-semibold text-blue" href={`/admin/requests/${r.id}`}>{r.ref}</Link></td>
                <td>{r.athlete_name}</td>
                <td>{coaches.get(r.coach_id)?.full_name}</td>
                <td><Pill kind="request" value={r.status} /></td>
                <td><Pill value={r.payout_status} /></td>
                <td>{money(r.price_cents)}</td>
                <td className="whitespace-nowrap text-muted">{dateTime(r.created_at)}</td>
              </tr>
            ))}
            {!recent.length && <tr><td colSpan={7} className="py-8 text-center text-muted">No requests yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-subtle">{sub}</p>}
    </div>
  );
}
function Target({ label, value, target, ok }: { label: string; value: string; target: string; ok: boolean }) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-bold">{value} <span className={`text-xs font-semibold ${ok ? "text-success" : "text-subtle"}`}>target {target}</span></p>
    </div>
  );
}
