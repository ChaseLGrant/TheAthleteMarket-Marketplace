import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { ActionForm } from "@/components/admin-ui";
import { Pill } from "@/components/status";
import { dateTime, money } from "@/lib/format";
import { getDeps } from "@/lib/server";
import { requestAction } from "../../../actions";

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const deps = await getDeps();
  const r = await deps.store.getRequest(id);
  if (!r) notFound();
  const [coach, events, emails] = await Promise.all([deps.store.getCoach(r.coach_id), deps.store.listEvents(id), deps.store.listEmails({ request_id: id })]);
  const videoUrl = r.video_path ? await deps.storage.playbackUrl(r.video_path, 3600).catch(() => null) : null;
  const open = ["paid", "coach_notified", "accepted"].includes(r.status);
  const f = { id };
  const stripeBase = "https://dashboard.stripe.com";

  return (
    <div className="space-y-5">
      <Link href="/admin/requests" className="text-sm text-muted">← Requests</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{r.ref}</h1>
        <Pill kind="request" value={r.status} /><Pill value={`payout: ${r.payout_status}`} /><Pill value={`refund: ${r.refund_status}`} />
      </div>
      {r.last_error && <p className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-[#7a1717]">Last error: {r.last_error}</p>}
      {r.payout_block_reason && <p className="rounded-xl bg-warn-50 px-4 py-3 text-sm text-[#6b3d00]">Payout blocked: {r.payout_block_reason}</p>}

      <section className="card flex flex-wrap gap-3 p-4">
        {r.status === "submitted" && <ActionForm action={requestAction} fields={{ ...f, op: "approve_video" }} label="Approve video & deliver" tone="primary" />}
        {open && <ActionForm action={requestAction} fields={{ ...f, op: "resend_coach" }} label="Resend coach email" />}
        {open && <ActionForm action={requestAction} fields={{ ...f, op: "extend", hours: "48" }} label="Extend deadline 48h" />}
        {r.status === "completed" && <ActionForm action={requestAction} fields={{ ...f, op: "resend_delivery" }} label="Resend delivery email" />}
        {r.status === "completed" && <ActionForm action={requestAction} fields={{ ...f, op: "revoke_delivery" }} label="Revoke delivery link" confirm="Revoke the family's link?" />}
        {r.status === "completed" && ["pending", "blocked", "failed"].includes(r.payout_status) && <ActionForm action={requestAction} fields={{ ...f, op: "retry_payout" }} label="Retry payout" />}
        {r.payout_status === "paid" && <ActionForm action={requestAction} fields={{ ...f, op: "reverse_payout" }} label="Reverse coach transfer" tone="danger" confirm="Pull the payout back from the coach's Stripe balance?" />}
        {r.stripe_payment_intent_id && r.status !== "refunded" && r.payout_status !== "paid" && (
          <ActionForm action={requestAction} fields={{ ...f, op: "refund" }} label={r.payment_captured_at ? "Full refund (Stripe keeps fee)" : "Cancel & release card hold"} tone="danger" confirm={r.payment_captured_at ? `Refund ${money(r.price_cents)} to ${r.purchaser_email}? Stripe keeps its fee.` : `Release the hold? ${r.purchaser_email} will not be charged.`} />
        )}
        {r.video_path && <ActionForm action={requestAction} fields={{ ...f, op: "delete_video" }} label="Delete video" tone="danger" confirm="Permanently delete the video file?" />}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Athlete & purchaser</h2>
          <dl className="mt-3 grid grid-cols-[140px_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted">Athlete</dt><dd>{r.athlete_name} {r.athlete_is_minor && <Pill value="minor" />}</dd>
            <dt className="text-muted">Sport / pos</dt><dd>{r.sport} · {r.position} · {r.grad_year}</dd>
            <dt className="text-muted">Film</dt><dd><a href={r.film_url} target="_blank" rel="noreferrer noopener" className="break-all text-blue">{r.film_url}</a></dd>
            <dt className="text-muted">Metrics / GPA</dt><dd>{r.metrics ?? "—"} / {r.gpa ?? "—"}</dd>
            <dt className="text-muted">Message</dt><dd className="whitespace-pre-line">{r.message ?? "—"}</dd>
            <dt className="text-muted">Purchaser</dt><dd>{r.purchaser_name} ({r.purchaser_relationship.replace("_", " ")})<br />{r.purchaser_email}</dd>
            <dt className="text-muted">Consent</dt><dd>{r.guardian_consent_at ? `Guardian ${dateTime(r.guardian_consent_at)}` : "n/a (adult)"} · Terms {dateTime(r.terms_accepted_at)}</dd>
            <dt className="text-muted">UTM</dt><dd>{r.utm_source ?? "—"} / {r.utm_campaign ?? "—"}</dd>
          </dl>
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">Money</h2>
          <dl className="mt-3 grid grid-cols-[160px_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted">Price</dt><dd>{money(r.price_cents)}</dd>
            <dt className="text-muted">Commission</dt><dd>{money(r.platform_fee_cents)}</dd>
            <dt className="text-muted">Coach payout</dt><dd>{money(r.coach_payout_cents)}</dd>
            <dt className="text-muted">Card</dt><dd>{r.payment_captured_at ? `Charged ${dateTime(r.payment_captured_at)}` : r.stripe_payment_intent_id ? `Hold only${r.authorization_expires_at ? ` (expires ${dateTime(r.authorization_expires_at)})` : ""}` : "—"}</dd>
            <dt className="text-muted">Stripe fee</dt><dd>{r.stripe_fee_cents == null ? "—" : money(r.stripe_fee_cents)}</dd>
            <dt className="text-muted">Payment</dt><dd>{r.stripe_payment_intent_id ? <a className="text-blue" href={`${stripeBase}/payments/${r.stripe_payment_intent_id}`} target="_blank" rel="noreferrer">{r.stripe_payment_intent_id}</a> : "—"}</dd>
            <dt className="text-muted">Transfer</dt><dd>{r.stripe_transfer_id ? <a className="text-blue" href={`${stripeBase}/connect/transfers/${r.stripe_transfer_id}`} target="_blank" rel="noreferrer">{r.stripe_transfer_id}</a> : "—"}</dd>
            <dt className="text-muted">Refund</dt><dd>{r.stripe_refund_id ?? "—"} (attempts {r.refund_attempts})</dd>
            <dt className="text-muted">Dispute</dt><dd>{r.stripe_dispute_id ? `${r.stripe_dispute_id} · ${r.dispute_status}` : "—"}</dd>
            <dt className="text-muted">Coach</dt><dd>{coach && <Link className="text-blue" href={`/admin/coaches/${coach.id}`}>{coach.full_name}</Link>}</dd>
          </dl>
        </section>
      </div>

      {r.video_deleted_at && <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">Video auto-deleted {dateTime(r.video_deleted_at)} (retention). Delivery record kept: {r.video_size_bytes ? `${(r.video_size_bytes / 1_048_576).toFixed(1)} MB` : ""}, {r.video_duration_seconds ?? "?"}s, viewed {r.video_view_count}×.</p>}
      {videoUrl && (
        <section className="card p-5">
          <h2 className="font-semibold">Video</h2>
          <p className="text-xs text-muted">{r.video_mime} · {r.video_size_bytes ? `${(r.video_size_bytes / 1_048_576).toFixed(1)} MB` : ""} · {r.video_duration_seconds ?? "?"}s · viewed {r.video_view_count}×</p>
          <video src={videoUrl} controls playsInline className="mt-3 aspect-video w-full max-w-2xl rounded-xl bg-black" />
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card overflow-x-auto">
          <h2 className="p-4 font-semibold">Timeline</h2>
          <table className="table-admin">
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-muted">{dateTime(e.created_at)}</td>
                  <td className="font-medium">{e.type}</td>
                  <td className="text-muted">{e.actor}</td>
                  <td className="text-xs text-muted">{e.from_status && `${e.from_status} → ${e.to_status ?? ""}`} {e.data ? JSON.stringify(e.data).slice(0, 160) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card overflow-x-auto">
          <h2 className="p-4 font-semibold">Emails</h2>
          <table className="table-admin">
            <tbody>
              {emails.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-muted">{dateTime(e.created_at)}</td>
                  <td>{e.template}<div className="text-xs text-muted">{e.to_email}</div></td>
                  <td><Pill value={e.status === "sent" ? "succeeded" : e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
