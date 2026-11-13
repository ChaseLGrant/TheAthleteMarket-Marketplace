import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { ActionForm, AdminForm } from "@/components/admin-ui";
import { Notice } from "@/components/ui";
import { paidRequestGate, payoutGate } from "@/lib/compliance";
import { DIVISIONS, SPORTS } from "@/lib/constants";
import { money } from "@/lib/format";
import { payoutsUrl } from "@/lib/services/links";
import { prettyPhone } from "@/lib/phone";
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

      {coach && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">
            Source: <strong>{coach.source}</strong>{coach.unlisted ? " (added by a family — not in public search)" : ""} ·
            Email {coach.email_confirmed_at ? "confirmed" : "not confirmed"} · {coach.requests_received} requests received · {coach.delivered_count} delivered
            {coach.stripe_legal_name && <> · Stripe name: <strong>{coach.stripe_legal_name}</strong></>}
          </p>
          <div className="flex gap-2">
            {pgate?.reasons.some((r) => r.startsWith("Name check")) && <ActionForm action={coachAction} fields={{ id, op: "name_ok" }} label="Name is correct — release payouts" tone="primary" confirm="Confirm this Stripe-verified person is the coach on this profile?" />}
            {coach.removed
              ? <ActionForm action={coachAction} fields={{ id, op: "restore" }} label="Restore listing" />
              : <ActionForm action={coachAction} fields={{ id, op: "remove" }} label="Remove listing" tone="danger" confirm="Hide this coach and block new requests (e.g. takedown request)?" />}
          </div>
        </div>
      )}
      {gate && (gate.ok
        ? <Notice tone="success" title="Requestable">Families can send this coach paid requests.</Notice>
        : <Notice tone="warn" title="Can't be requested right now"><ul className="list-disc pl-5">{gate.reasons.map((r) => <li key={r}>{r}</li>)}</ul></Notice>)}

      <AdminForm action={saveCoach} className="card p-5">
        <input type="hidden" name="id" value={isNew ? "" : id} />
        <h2 className="font-semibold">Profile</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <T n="phone" l="Mobile (for text alerts)" v={c.phone ? prettyPhone(c.phone) : ""} t="tel" />
          <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="sms_consent" defaultChecked={!!c.sms_opt_in_at} className="h-5 w-5 accent-blue" />
            Coach consented to texts{c.sms_opt_in_at ? ` (${c.sms_opt_in_at.slice(0, 10)})` : ""}{c.sms_opted_out ? " — replied STOP" : ""}</label>
          <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="paused" defaultChecked={!!c.paused} className="h-5 w-5 accent-blue" />Paused (not bookable)</label>
        </div>
        <div><label className="label" htmlFor="bio">Bio</label><textarea id="bio" name="bio" rows={3} defaultValue={c.bio ?? ""} className="field" /></div>
        {c.application_message && <Notice title="Application note">{c.application_message}</Notice>}

        <h2 className="pt-2 font-semibold">Approval</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <S n="listing_type" l="Listing" v={c.listing_type} opts={["directory", "participating"]} />
          <S n="coach_kind" l="Coach status" v={c.coach_kind} opts={["former_college", "independent", "pro_player", "active_college"]} />
          <S n="verification_status" l="Identity verification" v={c.verification_status} opts={["unverified", "pending", "verified", "rejected"]} />
          <S n="eligibility_status" l="Eligibility" v={c.eligibility_status} opts={["not_reviewed", "pending_review", "approved", "denied", "suspended"]} />
        </div>
        <div><label className="label" htmlFor="eligibility_basis">Approval note (how you verified who they are)</label>
          <textarea id="eligibility_basis" name="eligibility_basis" rows={2} defaultValue={c.eligibility_basis ?? ""} className="field" placeholder="e.g. Former D2 head coach, left Example U 2024, confirmed no current college employment via LinkedIn + call on 2026-11-01" /></div>
        <div><label className="label" htmlFor="authorization_reference">Compliance office note (optional — e.g. if the coach shares written approval)</label>
          <textarea id="authorization_reference" name="authorization_reference" rows={2} defaultValue={c.authorization_reference ?? ""} className="field" placeholder="Compliance office letter ref, date, signatory; governing-body interpretation ref" /></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <T n="eligibility_expires_at" l="Eligibility re-review date" v={c.eligibility_expires_at?.slice(0, 10)} t="date" />
          <S n="price_cents" l="Price" v={c.price_cents ? String(c.price_cents) : ""} opts={["", ...settings.price_tiers_cents.map(String)]} />
          <div className="text-sm text-muted"><p className="label">Coach receives</p>{c.price_cents ? money(c.price_cents - Math.round((c.price_cents * settings.commission_bps) / 10000)) : "—"}</div>
        </div>
      </AdminForm>

      {coach && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section className="card space-y-3 p-5">
            <h2 className="font-semibold">Stripe Connect payouts</h2>
            <p className="text-sm">Account: {coach.stripe_account_id ?? "not created"} · Transfers {coach.stripe_transfers_active ? "active" : "inactive"} · Details {coach.stripe_details_submitted ? "submitted" : "missing"} · Payouts {coach.stripe_payouts_enabled ? "enabled" : "disabled"}</p>
            {pgate && !pgate.ok && <p className="text-xs text-muted">Payout gate: {pgate.reasons.join(" ")}</p>}
            <p className="break-all text-xs text-muted">Coach hub link (payouts, pause, intro video): {payoutsUrl(coach)}</p>
            <p className="text-xs text-muted">Payout-setup email: {coach.payout_invite_sent_at ? `sent ${coach.payout_invite_sent_at.slice(0, 10)}` : "not sent (sent automatically on approval)"}</p>
            <p className="text-xs text-muted">Delivered {coach.delivered_count} · rating {coach.rating_count ? `${(coach.rating_sum / coach.rating_count).toFixed(1)} (${coach.rating_count})` : "—"}</p>
            <div className="flex flex-wrap gap-2">
              <ActionForm action={coachAction} fields={{ id, op: "send_payout_invite" }} label="Email coach hub link" />
              {coach.intro_video_path && <ActionForm action={coachAction} fields={{ id, op: "remove_intro" }} label="Remove intro video" tone="danger" confirm="Remove this coach's public intro video?" />}
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
