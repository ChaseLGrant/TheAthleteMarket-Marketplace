import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { Pill } from "@/components/status";
import { dateTime, money } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/state-machine";
import { getDeps } from "@/lib/server";
import type { RequestStatus } from "@/lib/types";

export default async function Requests({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const deps = await getDeps();
  const status = sp.status && sp.status in STATUS_LABEL ? [sp.status as RequestStatus] : undefined;
  const list = await deps.store.listRequests({ status, q: sp.q?.slice(0, 80), limit: 300 });
  const coaches = new Map((await Promise.all([...new Set(list.map((r) => r.coach_id))].map((id) => deps.store.getCoach(id)))).filter(Boolean).map((c) => [c!.id, c!]));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Requests</h1>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Ref, athlete or email" className="field max-w-xs" />
        <select name="status" defaultValue={sp.status ?? ""} className="field max-w-[220px]">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn-navy">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table-admin">
          <thead><tr><th>Ref</th><th>Athlete</th><th>Coach</th><th>Purchaser</th><th>Status</th><th>Payout</th><th>Refund</th><th>Price</th><th>Deadline</th><th>Created</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td><Link className="font-semibold text-blue" href={`/admin/requests/${r.id}`}>{r.ref}</Link></td>
                <td>{r.athlete_name}<div className="text-xs text-muted">{r.sport} · {r.position} · {r.grad_year}{r.athlete_is_minor ? " · minor" : ""}</div></td>
                <td>{coaches.get(r.coach_id)?.full_name}</td>
                <td className="text-muted">{r.purchaser_email}</td>
                <td><Pill kind="request" value={r.status} /></td>
                <td><Pill value={r.payout_status} /></td>
                <td><Pill value={r.refund_status} /></td>
                <td>{money(r.price_cents)}</td>
                <td className="whitespace-nowrap text-muted">{dateTime(r.expires_at)}</td>
                <td className="whitespace-nowrap text-muted">{dateTime(r.created_at)}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={10} className="py-8 text-center text-muted">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
