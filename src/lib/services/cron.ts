import { randomUUID } from "node:crypto";
import type { Deps } from "../deps";
import { env } from "../env";
import { coachInvite } from "../email/templates";
import { log } from "../log";
import { videoDeletable } from "../retention";
import { coachDeclineUrl, coachReviewUrl, unsubscribeUrl } from "./links";
import { sendEmail } from "./notify";
import { attemptPayout, capturePayment, completeRequest, notifyCoach, refundRequest } from "./lifecycle";

const HOUR = 3_600_000;

/**
 * One idempotent sweep, run every ~15–60 minutes. Each step is independently safe to repeat
 * and to run concurrently with webhooks and user actions (all writes are compare-and-set).
 */
export async function runCron(deps: Deps) {
  const now = deps.now();
  const nowIso = now.toISOString();
  const settings = await deps.store.getSettings();
  const out = { notified: 0, expired: 0, refundsRetried: 0, payoutsRetried: 0, reconciled: 0, reminders: 0, cancelled: 0, videosDeleted: 0, purged: 0, errors: 0 };
  const safe = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { out.errors++; log("error", `cron:${label}`, { error: String(e) }); }
  };

  // 1. Paid but coach email not yet sent (email provider hiccup) → retry.
  for (const r of await deps.store.listRequests({ status: ["paid"] }))
    await safe("notify", async () => { await notifyCoach(deps, r.id); out.notified++; });

  // 2. Deadline passed without a video → expire + release the card hold (no charge, no fee). Late uploads can no longer be submitted.
  for (const r of await deps.store.listRequests({ status: ["paid", "coach_notified", "accepted"], expiresBefore: nowIso })) {
    await safe("expire", async () => {
      const e = await deps.store.casRequest(r.id, { status: ["paid", "coach_notified", "accepted"], expiresBefore: nowIso }, { status: "expired", expired_at: nowIso });
      if (e) {
        await deps.store.addEvent({ request_id: r.id, type: "expired", actor: "cron", from_status: r.status, to_status: "expired", data: null });
        await refundRequest(deps, r.id, "expired", "cron");
        out.expired++;
      }
    });
  }

  // 3. Refunds that failed or were interrupted → retry (bounded).
  const needRefund = [
    ...(await deps.store.listRequests({ status: ["declined", "expired"], refund_status: ["none", "failed"] })),
    ...(await deps.store.listRequests({ refund_status: ["processing"] })).filter((r) => Date.parse(r.updated_at) < now.getTime() - 0.25 * HOUR),
  ];
  for (const r of needRefund) {
    if (r.refund_attempts >= 6) continue;
    await safe("refund", async () => {
      if (r.refund_status === "processing") await deps.store.casRequest(r.id, { refund_status: ["processing"] }, { refund_status: "failed" });
      const why = r.status === "declined" ? "declined" : r.status === "expired" ? "expired" : "admin";
      await refundRequest(deps, r.id, why, "cron");
      out.refundsRetried++;
    });
  }

  // 4. Stuck payouts (crash mid-transfer) → reconcile against Stripe, then retry pending/blocked/failed.
  for (const r of await deps.store.listRequests({ payout_status: ["processing"] })) {
    if (Date.parse(r.updated_at) > now.getTime() - 0.25 * HOUR) continue;
    await safe("reconcile", async () => {
      const t = await deps.payments.findTransferForGroup(`req_${r.id}`);
      await deps.store.casRequest(r.id, { payout_status: ["processing"] },
        t ? { payout_status: "paid", stripe_transfer_id: t.id, paid_out_at: nowIso } : { payout_status: "failed" });
      out.reconciled++;
    });
  }
  for (const r of await deps.store.listRequests({ status: ["completed"], payout_status: ["pending", "blocked", "failed"] })) {
    if (r.payout_status === "failed" && r.payout_attempts >= 8) continue;
    await safe("payout", async () => { await attemptPayout(deps, r.id); out.payoutsRetried++; });
  }

  // 4b. Video submitted but the capture failed earlier → retry; deliver if it now succeeds.
  for (const r of await deps.store.listRequests({ status: ["submitted"] })) {
    if (r.payment_captured_at) continue;
    await safe("capture", async () => {
      if (await capturePayment(deps, r.id) && !settings.require_admin_review) await completeRequest(deps, r.id, "cron");
    });
  }

  // 5. Reminders. Windows are wide enough for a once-a-day cron (Vercel Hobby).
  for (const r of await deps.store.listRequests({ status: ["coach_notified", "accepted"] })) {
    if (!r.expires_at) continue;
    const hoursLeft = (Date.parse(r.expires_at) - now.getTime()) / HOUR;
    const due = (r.reminder_count === 0 && hoursLeft <= 72 && hoursLeft > 36) || (r.reminder_count <= 1 && hoursLeft <= 36 && hoursLeft > 1);
    if (!due) continue;
    await safe("reminder", async () => {
      const coach = await deps.store.getCoach(r.coach_id);
      if (!coach?.email) return;
      const n = r.reminder_count + 1;
      const claimed = await deps.store.casRequest(r.id, { status: ["coach_notified", "accepted"] }, { reminder_count: n, last_reminder_at: nowIso });
      if (!claimed) return;
      await sendEmail(deps, {
        to: coach.email,
        rendered: coachInvite({
          req: r, coach, reviewUrl: coachReviewUrl(r), declineUrl: coachDeclineUrl(r),
          unsubscribeUrl: unsubscribeUrl(coach.email), postalAddress: env.postalAddress(),
          reminder: { daysLeft: Math.max(1, Math.round(hoursLeft / 24)) },
        }),
        template: "coach_reminder",
        idempotencyKey: `coach-reminder-${r.id}-${n}`,
        requestId: r.id,
        coachId: coach.id,
        marketing: true,
      });
      out.reminders++;
    });
  }

  // 6. Abandoned checkouts (Stripe also sends checkout.session.expired; this is the backstop).
  for (const r of await deps.store.listRequests({ status: ["awaiting_payment"] })) {
    if (Date.parse(r.created_at) > now.getTime() - 3 * HOUR) continue;
    await safe("cancel", async () => {
      if (await deps.store.casRequest(r.id, { status: ["awaiting_payment"] }, { status: "cancelled" })) out.cancelled++;
    });
  }

  // 7a. Videos are deleted video_retention_days after delivery (families were told to download them).
  //     Kept while a chargeback is open, because the video is the proof of delivery.
  const videoCutoff = new Date(now.getTime() - settings.video_retention_days * 24 * HOUR).toISOString();
  for (const r of await deps.store.listRequests({ status: ["completed", "refunded"], completedBefore: videoCutoff })) {
    if (!r.video_path || !videoDeletable(r)) continue;
    await safe("video-delete", async () => {
      await deps.storage.remove(r.video_path!);
      const d = await deps.store.casRequest(r.id, {}, { video_path: null, video_deleted_at: nowIso });
      if (d) await deps.store.addEvent({ request_id: r.id, type: "video_deleted", actor: "cron", from_status: null, to_status: null, data: { reason: "retention" } });
      out.videosDeleted++;
    });
  }

  // 7b. Data retention: delete any remaining video + minors' details after the (longer) retention window.
  const cutoff = new Date(now.getTime() - settings.retention_days * 24 * HOUR).toISOString();
  const old = [
    ...(await deps.store.listRequests({ status: ["completed"], completedBefore: cutoff })),
    ...(await deps.store.listRequests({ status: ["refunded", "cancelled"] })).filter((r) => r.updated_at < cutoff),
  ].filter((r) => !r.purged_at && (r.payout_status === "paid" || r.payout_status === "none" || r.payout_status === "reversed"));
  for (const r of old) {
    await safe("purge", async () => {
      if (r.video_path) await deps.storage.remove(r.video_path);
      await deps.store.casRequest(r.id, {}, {
        purged_at: nowIso, video_path: null, film_url: "about:blank", metrics: null, gpa: null, message: null,
        athlete_email: null, athlete_name: "(removed)", delivery_link_nonce: randomUUID(), coach_link_nonce: randomUUID(),
      });
      out.purged++;
    });
  }

  log("info", "cron complete", out);
  return out;
}
