import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { ActionForm, AdminForm } from "@/components/admin-ui";
import { Notice } from "@/components/ui";
import { paidRequestGate, payoutGate } from "@/lib/compliance";
import { DIVISIONS, SPORTS } from "@/lib/constants";
import { money } from "@/lib/format";
import { payoutsUrl } from "@/lib/services/links";
import { getDeps } from "@/lib/server";
import type { Coach } from "@/lib/types";
import { coachAction, saveCoach } from "../../../actions";

export default async function CoachEditor({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const deps = await getDeps();
  const isNew = id === "new";
  const coach = isNew ? null : await deps.store.getCoach(id);
  if (!isNew && !coach) notFound();
  const settings = await deps.store.getSettings();
  const c: Partial<Coach> = coach ?? { listing_type: "participating", coach_kind: "former_college", verification_status: "pending", eligibility_status: "pending_review", sport: "" };
  const gate = coach ? paidRequestGate(coach, settings) : null;
  const pgate = coach ? payoutGate(coach, settings) : null;
  const requests = coach ? await deps.store.listRequests({ coach_id: coach.id, limit: 50 }) : [];

  const T = ({ n, l, v, t = "text" }: { n: string; l: string; v?: string | null; t?: string }) => (
    <div><label className="label" htmlFor={n}>{l}</label><input id={n} name={n} type={t} defaultValue={v ?? ""} className="field" /></div>
  );
  const S = ({ n, l, v, opts }: { n: string; l: string; v?: string | null; opts: string[] }) => (
    <div><label className="label" htmlFor={n}>{l}</label>
      <select id={n} name={n} defaultValue={v ?? ""} className="field">{opts.map((o) => <option key={o} value={o}>{o ? o.replace(/_/g, " ") : "—"}</option>)}</select></div>
  );

  return (
    <div className="space-y-5">
      <Link href="/admin/coaches" className="text-sm text-muted">← Coaches</Link>
      <h1 className="text-2xl font-bold">{isNew ? "Add coach" : c.full_name}</h1>

      {gate && (gate.ok
        ? <Notice tone="success" title="Bookable">This coach passes the compliance gate and can receive paid requests.</Notice>
        : <Notice tone="warn" title="Not bookable"><ul className="list-disc pl-5">{gate.reasons.map((r) => <li key={r}>{r}</li>)}</ul></Notice>)}

      <AdminForm action={saveCoach} className="card p-5">
        <input type="hidden" name="id" value={isNew ? "" : id} />
        <h2 className="font-semibold">Profile</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <T n="full_name" l="Full name" v={c.full_name} />
          <T n="title" l="Title" v={c.title} />
          <T n="school" l="School" v={c.school} />
          <S n="sport" l="Sport" v={c.sport} opts={[...new Set([...(c.sport ? [c.sport] : []), ...SPORTS])]} />
          <S n="division" l="Division" v={c.division} opts={["", ...DIVISIONS]} />
          <T n="conference" l="Conference" v={c.conference} />
          <T n="state" l="State (2 letters)" v={c.state} />
          <T n="email" l="Email (receives requests)" v={c.email} t="email" />
          <T n="photo_url" l="Photo URL (https)" v={c.photo_url} />
        </div>
        <T n="credentials" l="Credentials line" v={c.credentials} />
        <div><label className="label" htmlFor="bio">Bio</label><textarea id="bio" name="bio" rows={3} defaultValue={c.bio ?? ""} className="field" /></div>
        {c.application_message && <Notice title="Application note">{c.application_message}</Notice>}

        <h2 className="pt-2 font-semibold">Compliance gate</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <S n="listing_type" l="Listing" v={c.listing_type} opts={["directory", "participating"]} />
          <S n="coach_kind" l="Coach status" v={c.coach_kind} opts={["former_college", "independent", "active_college"]} />
          <S n="verification_status" l="Identity verification" v={c.verification_status} opts={["unverified", "pending", "verified", "rejected"]} />
          <S n="eligibility_status" l="Eligibility" v={c.eligibility_status} opts={["not_reviewed", "pending_review", "approved", "denied", "suspended"]} />
        </div>
        <div><label className="label" htmlFor="eligibility_basis">Eligibility basis (required to approve)</label>
          <textarea id="eligibility_basis" name="eligibility_basis" rows={2} defaultValue={c.eligibility_basis ?? ""} className="field" placeholder="e.g. Former D2 head coach, left Example U 2024, confirmed no current college employment via LinkedIn + call on 2026-11-01" /></div>
        <div><label className="label" htmlFor="authorization_reference">Institution + governing-body authorization (required for active college coaches)</label>
          <textarea id="authorization_reference" name="authorization_reference" rows={2} defaultValue={c.authorization_reference ?? ""} className="field" placeholder="Compliance office letter ref, date, signatory; governing-body interpretation ref" /></div>
        <div className="grid gap-4 md:grid-cols-3">
          <T n="eligibility_expires_at" l="Eligibility re-review date" v={c.eligibility_expires_at?.slice(0, 10)} t="date" />
          <S n="price_cents" l="Price" v={c.price_cents ? String(c.price_cents) : ""} opts={["", ...settings.price_tiers_cents.map(String)]} />
          <div className="text-sm text-muted"><p className="label">Coach receives</p>{c.price_cents ? money(c.price_cents - Math.round((c.price_cents * settings.commission_bps) / 10000)) : "—"}</div>
        </div>
      </AdminForm>

      {coach && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card space-y-3 p-5">
            <h2 className="font-semibold">Stripe Connect payouts</h2>
            <p className="text-sm">Account: {coach.stripe_account_id ?? "not created"} · Transfers {coach.stripe_transfers_active ? "active" : "inactive"} · Details {coach.stripe_details_submitted ? "submitted" : "missing"} · Payouts {coach.stripe_payouts_enabled ? "enabled" : "disabled"}</p>
            {pgate && !pgate.ok && <p className="text-xs text-muted">Payout gate: {pgate.reasons.join(" ")}</p>}
            <p className="break-all text-xs text-muted">Coach payout setup link (send if they lost the email): {payoutsUrl(coach)}</p>
            <div className="flex flex-wrap gap-2">
              {coach.stripe_account_id && <ActionForm action={coachAction} fields={{ id, op: "sync_stripe" }} label="Refresh from Stripe" />}
              {coach.opted_out && <ActionForm action={coachAction} fields={{ id, op: "opt_in" }} label="Re-enable emails" confirm="Only do this if the coach asked to opt back in." />}
            </div>
            {coach.opted_out && <p className="text-sm font-medium text-danger">Coach opted out of all emails.</p>}
          </section>
          <section className="card overflow-x-auto">
            <h2 className="p-4 font-semibold">Requests ({requests.length})</h2>
            <table className="table-admin"><tbody>
              {requests.map((r) => <tr key={r.id}><td><Link className="text-blue" href={`/admin/requests/${r.id}`}>{r.ref}</Link></td><td>{r.athlete_name}</td><td>{r.status}</td><td>{r.payout_status}</td></tr>)}
            </tbody></table>
          </section>
        </div>
      )}
    </div>
  );
}
