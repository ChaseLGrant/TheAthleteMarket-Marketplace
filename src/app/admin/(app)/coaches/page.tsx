import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { AdminForm } from "@/components/admin-ui";
import { Pill } from "@/components/status";
import { paidRequestGate } from "@/lib/compliance";
import { money } from "@/lib/format";
import { getDeps } from "@/lib/server";
import { importCoaches } from "../../actions";

export default async function Coaches({ searchParams }: { searchParams: Promise<{ q?: string; listing?: string; eligibility?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const deps = await getDeps();
  const [list, settings, waitlist] = await Promise.all([
    deps.store.listCoachesAdmin({ q: sp.q, listing: sp.listing, eligibility: sp.eligibility, limit: 300 }),
    deps.store.getSettings(),
    deps.store.waitlistCounts(),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Coaches</h1>
        <Link href="/admin/coaches/new" className="btn-primary btn-sm">+ Add coach</Link>
      </div>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Search" className="field max-w-xs" />
        <select name="listing" defaultValue={sp.listing ?? ""} className="field max-w-[180px]"><option value="">All listings</option><option value="participating">Participating</option><option value="directory">Directory</option></select>
        <select name="eligibility" defaultValue={sp.eligibility ?? ""} className="field max-w-[200px]">
          <option value="">Any eligibility</option>
          {["not_reviewed", "pending_review", "approved", "denied", "suspended"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <button className="btn-navy">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table-admin">
          <thead><tr><th>Name</th><th>Sport</th><th>School</th><th>Listing</th><th>Kind</th><th>Identity</th><th>Source</th><th>Price</th><th>Stripe</th><th>Bookable</th><th>Delivered</th><th>Rating</th><th>Waitlist</th></tr></thead>
          <tbody>
            {list.map((c) => {
              const gate = paidRequestGate(c, settings);
              return (
                <tr key={c.id}>
                  <td><Link className="font-semibold text-blue" href={`/admin/coaches/${c.id}`}>{c.full_name}</Link>{c.is_demo && <span className="ml-1 text-xs text-subtle">demo</span>}</td>
                  <td>{c.sport}</td>
                  <td className="text-muted">{c.school}<div className="text-xs">{c.division}</div></td>
                  <td><Pill value={c.listing_type} /></td>
                  <td className="text-xs text-muted">{c.coach_kind === "pro_player" ? "pro player" : c.coach_kind.replace("_", " ")}</td>
                  <td>{c.stripe_legal_name ? <span className="text-xs">Stripe ✓</span> : <Pill value="unverified" />}</td>
                  <td className="text-xs">{c.removed ? "🚫 removed" : c.source}{c.unlisted ? " · unlisted" : ""}{c.email_confirmed_at ? " · ✉︎ confirmed" : ""}</td>
                  <td>{c.price_cents ? money(c.price_cents) : "—"}</td>
                  <td className="text-xs">{c.stripe_transfers_active ? "✅ active" : c.stripe_account_id ? "⏳ started" : "—"}</td>
                  <td title={gate.reasons.join("\n")}>{gate.ok ? "✅" : c.paused ? "⏸" : "—"}</td>
                  <td>{c.delivered_count}</td>
                  <td>{c.rating_count ? `★ ${(c.rating_sum / c.rating_count).toFixed(1)} (${c.rating_count})` : "—"}</td>
                  <td>{waitlist[c.id] ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="card p-5">
        <summary className="cursor-pointer font-semibold">Import directory listings (CSV)</summary>
        <p className="mt-2 text-sm text-muted">
          Headers: <code>full_name,title,school,sport,division,conference,state,email,type</code> (type optional: active_college, former_college, independent, pro_player). Every imported coach with an email can be requested by families right away.
          Use only publicly available information you have the right to use, and honor removal requests.
        </p>
        <AdminForm action={importCoaches} submit="Import" className="mt-3">
          <textarea name="csv" rows={8} className="field font-mono text-xs" placeholder={"full_name,title,school,sport,division,conference,state,email,type\nJane Doe,Assistant Coach,Example University,Soccer (W),NCAA D1,Example Conf,OH,jdoe@example.edu,active_college\nSam Lee,Outfielder,Example Pro Club,Baseball,Professional,,GA,sam@example.com,pro_player"} />
        </AdminForm>
      </details>
    </div>
  );
}
