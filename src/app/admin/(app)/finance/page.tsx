import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { Pill } from "@/components/status";
import { dateTime, money } from "@/lib/format";
import { getDeps } from "@/lib/server";
import type { EvalRequest } from "@/lib/types";

export default async function Finance() {
  await requireAdmin();
  const deps = await getDeps();
  const all = await deps.store.listRequests({ limit: 5000 });
  const disputes = await deps.store.listDisputes();
  const paid = all.filter((r) => r.paid_at);
  const sum = (xs: EvalRequest[], f: (r: EvalRequest) => number) => xs.reduce((s, r) => s + f(r), 0);
  const collected = sum(paid, (r) => r.price_cents);
  const refunded = sum(paid.filter((r) => r.refund_status === "succeeded"), (r) => r.price_cents);
  const transferred = sum(paid.filter((r) => r.payout_status === "paid"), (r) => r.coach_payout_cents);
  const owed = sum(paid.filter((r) => r.status === "completed" && !["paid", "reversed"].includes(r.payout_status)), (r) => r.coach_payout_cents);
  const fees = sum(paid, (r) => r.stripe_fee_cents ?? 0);
  const inFlight = sum(paid.filter((r) => ["paid", "coach_notified", "accepted", "submitted"].includes(r.status)), (r) => r.price_cents);
  const expectedBalance = collected - refunded - transferred - fees;

  const payouts = paid.filter((r) => r.payout_status !== "none");
  const refunds = paid.filter((r) => r.refund_status !== "none");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Money</h1>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Collected", collected], ["Refunded", refunded], ["Transferred to coaches", transferred], ["Stripe fees", fees],
          ["Owed to coaches", owed], ["Held for open requests", inFlight], ["Expected platform balance", expectedBalance],
        ].map(([l, v]) => (
          <div key={l as string} className="card p-4"><p className="text-xs text-muted">{l}</p><p className="mt-1 text-xl font-bold">{money(v as number)}</p></div>
        ))}
      </section>
      <p className="text-xs text-muted">
        Reconciliation: &ldquo;Expected platform balance&rdquo; should match Stripe&apos;s available + pending balance for these charges (excluding other activity).
        Investigate any difference via the Stripe balance report.
      </p>

      <Table title="Payouts" rows={payouts} cols={["Ref", "Coach payout", "Status", "Transfer", "Attempts", "Reason / error", "Paid out"]}
        render={(r) => [<Ref key="r" r={r} />, money(r.coach_payout_cents), <Pill key="p" value={r.payout_status} />, r.stripe_transfer_id ?? "—", r.payout_attempts, r.payout_block_reason ?? r.last_error ?? "", dateTime(r.paid_out_at)]} />
      <Table title="Refunds" rows={refunds} cols={["Ref", "Amount", "Status", "Refund", "Attempts", "Why", "Refunded"]}
        render={(r) => [<Ref key="r" r={r} />, money(r.price_cents), <Pill key="p" value={r.refund_status} />, r.stripe_refund_id ?? "—", r.refund_attempts, r.decline_reason ?? (r.expired_at ? "expired" : r.status), dateTime(r.refunded_at)]} />

      <section className="card overflow-x-auto">
        <h2 className="p-4 font-semibold">Disputes ({disputes.length})</h2>
        <table className="table-admin">
          <thead><tr><th>Dispute</th><th>Request</th><th>Amount</th><th>Reason</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>
            {disputes.map((d) => (
              <tr key={d.id}>
                <td><a className="text-blue" href={`https://dashboard.stripe.com/disputes/${d.id}`} target="_blank" rel="noreferrer">{d.id}</a></td>
                <td>{d.request_id ? <Link className="text-blue" href={`/admin/requests/${d.request_id}`}>open</Link> : "—"}</td>
                <td>{money(d.amount_cents)}</td><td>{d.reason}</td><td><Pill value={d.status} /></td><td>{dateTime(d.updated_at)}</td>
              </tr>
            ))}
            {!disputes.length && <tr><td colSpan={6} className="py-6 text-center text-muted">No disputes.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Ref({ r }: { r: EvalRequest }) {
  return <Link className="font-semibold text-blue" href={`/admin/requests/${r.id}`}>{r.ref}</Link>;
}
function Table({ title, rows, cols, render }: { title: string; rows: EvalRequest[]; cols: string[]; render: (r: EvalRequest) => React.ReactNode[] }) {
  return (
    <section className="card overflow-x-auto">
      <h2 className="p-4 font-semibold">{title} ({rows.length})</h2>
      <table className="table-admin">
        <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 300).map((r) => <tr key={r.id}>{render(r).map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}
          {!rows.length && <tr><td colSpan={cols.length} className="py-6 text-center text-muted">None yet.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
