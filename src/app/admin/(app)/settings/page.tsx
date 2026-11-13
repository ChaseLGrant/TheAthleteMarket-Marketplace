import { requireAdmin } from "@/lib/admin";
import { AdminForm } from "@/components/admin-ui";
import { Notice } from "@/components/ui";
import { money } from "@/lib/format";
import { priceBreakdown } from "@/lib/pricing";
import { getDeps } from "@/lib/server";
import { addSpend, saveSettings } from "../../actions";

export default async function Settings() {
  await requireAdmin();
  const deps = await getDeps();
  const [s, spend] = await Promise.all([deps.store.getSettings(), deps.store.listMarketingSpend()]);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
      <AdminForm action={saveSettings} className="card p-5">
        <h1 className="text-xl font-bold">Pricing & operations</h1>
        <div><label className="label" htmlFor="tiers">Price tiers (USD, comma separated)</label>
          <input id="tiers" name="tiers" className="field" defaultValue={s.price_tiers_cents.map((c) => c / 100).join(", ")} /></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="commission_pct">Platform commission %</label>
            <input id="commission_pct" name="commission_pct" type="number" min={0} max={50} step={0.5} className="field" defaultValue={s.commission_bps / 100} />
            <p className="hint">Pilot: 0% (coach keeps 100%). Later: 20%.</p></div>
          <div><label className="label" htmlFor="deadline_days">Coach deadline (days, max 6)</label>
            <input id="deadline_days" name="deadline_days" type="number" min={1} max={6} className="field" defaultValue={s.deadline_days} /></div>
          <div><label className="label" htmlFor="max_open">Max open requests per coach</label>
            <input id="max_open" name="max_open" type="number" min={1} max={200} className="field" defaultValue={s.max_open_requests_per_coach} /></div>
          <div><label className="label" htmlFor="video_retention_days">Delete videos after delivery (days)</label>
            <input id="video_retention_days" name="video_retention_days" type="number" min={1} max={365} className="field" defaultValue={s.video_retention_days} />
            <p className="hint">Families are told to download before then. Kept longer only during an open chargeback.</p></div>
          <div><label className="label" htmlFor="retention_days">Athlete details retention (days)</label>
            <input id="retention_days" name="retention_days" type="number" min={30} max={3650} className="field" defaultValue={s.retention_days} /></div>
        </div>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="require_admin_review" defaultChecked={s.require_admin_review} className="mt-0.5 h-5 w-5 accent-blue" />
          <span><strong>Review every video before delivery</strong> (recommended for the first ~20 evaluations)</span></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="allow_active_college_coaches" defaultChecked={s.allow_active_college_coaches} className="mt-0.5 h-5 w-5 accent-blue" />
          <span><strong>Allow current college coaches</strong> (assistants, grad assistants, staff). On by default — coaches self-attest they&apos;re permitted. Turn off as an emergency stop.</span></label>

        <div className="rounded-xl bg-surface p-4 text-sm">
          <p className="font-semibold">Unit economics at current settings</p>
          <table className="mt-2 w-full text-left"><thead className="text-xs text-muted"><tr><th>Price</th><th>Coach gets</th><th>Commission</th><th>Est. Stripe fee</th><th>Platform net</th></tr></thead>
            <tbody>{s.price_tiers_cents.map((p) => { const b = priceBreakdown(p, s); return (
              <tr key={p}><td>{money(p)}</td><td>{money(b.coach_payout_cents)}</td><td>{money(b.platform_fee_cents)}</td><td>{money(b.estimated_stripe_fee_cents)}</td>
                <td className={b.estimated_platform_net_cents < 0 ? "text-danger" : "text-success"}>{money(b.estimated_platform_net_cents)}</td></tr>); })}</tbody></table>
          <p className="mt-2 text-xs text-muted">Cards are only held at checkout and charged on delivery, so declined/expired requests cost $0 in Stripe fees. Only admin refunds of already-charged payments lose the fee.</p>
        </div>
      </AdminForm>

      <div className="space-y-4">
        <AdminForm action={addSpend} submit="Add spend" className="card p-5">
          <h2 className="text-lg font-bold">Marketing spend (for CAC)</h2>
          <div className="grid grid-cols-3 gap-2">
            <input name="month" placeholder="2026-11" className="field" />
            <input name="channel" placeholder="meta, tiktok…" className="field" />
            <input name="amount" placeholder="$" type="number" step="0.01" className="field" />
          </div>
        </AdminForm>
        <div className="card overflow-x-auto">
          <table className="table-admin"><thead><tr><th>Month</th><th>Channel</th><th>Amount</th></tr></thead>
            <tbody>{spend.map((x) => <tr key={x.id}><td>{x.month.slice(0, 7)}</td><td>{x.channel}</td><td>{money(x.amount_cents)}</td></tr>)}
              {!spend.length && <tr><td colSpan={3} className="py-6 text-center text-muted">No spend recorded.</td></tr>}</tbody></table>
        </div>
      </div>
    </div>
  );
}
