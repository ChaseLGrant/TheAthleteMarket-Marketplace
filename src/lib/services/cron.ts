import { randomUUID } from "node:crypto";
import type { Deps } from "../deps";
import { env } from "../env";
import { coachInvite } from "../email/templates";
import { log } from "../log";
import { videoDeletable } from "../retention";
import { coachDeclineUrl, coachReviewUrl, hubUrl, unsubscribeUrl } from "./links";
import { sendEmail } from "./notify";
import { attemptPayout, capturePayment, completeRequest, notifyCoach, refundRequest, textCoach } from "./lifecycle";
import { sendWeeklySummaries } from "./experience";
import { coachDigest, sms as smsText } from "../email/templates";
import { mailtoReply, replyAddress, replyTemplate } from "./email-native";
import { answerUrl, escalateAsks, sendAskInvite } from "./line";
import type { EvalRequest } from "../types";

const HOUR = 3_600_000;

/**
 * One idempotent sweep, run every ~15–60 minutes. Each step is independently safe to repeat
 * and to run concurrently with webhooks and user actions (all writes are compare-and-set).
 */
export async function runCron(deps: Deps, opts: { budgetMs?: number } = {}) {
  const now = deps.now();
  // Time-boxed so a run never hits the hosting timeout at high volume; the next run picks up the rest.
  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > (opts.budgetMs ?? 50_000);
  const nowIso = now.toISOString();
  const settings = await deps.store.getSettings();
  const out = { partial: false, escalated: 0, notified: 0, expired: 0, refundsRetried: 0, payoutsRetried: 0, reconciled: 0, reminders: 0, weeklySummaries: 0, cancelled: 0, videosDeleted: 0, purged: 0, errors: 0 };
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

  // 4c. Coach Line: escalate unanswered messages to the next person on that school's staff.
  await safe("escalate", async () => { out.escalated = await escalateAsks(deps); });

  // 5. Follow-ups until the coach responds — grouped per coach (one email + one text per coach per run).
  //    stage 1: ~1 day after first contact if unopened · stage 2: ~3 days left · stage 3: final day.
  const due = new Map<string, { r: EvalRequest; stage: number }[]>();
  for (const r of await deps.store.listRequests({ status: ["coach_notified", "accepted"], limit: 10000 })) {
    if (!r.expires_at) continue;
    const hoursLeft = (Date.parse(r.expires_at) - now.getTime()) / HOUR;
    // Measured from when the CURRENT coach was contacted (escalation restarts the clock).
    const contactedAt = r.escalated_at ?? r.coach_notified_at;
    const hoursSinceNotify = contactedAt ? (now.getTime() - Date.parse(contactedAt)) / HOUR : 0;
    if (hoursSinceNotify < 20) continue; // never remind someone we just contacted (e.g. right after an escalation)
    const stages = [
      () => hoursSinceNotify >= 20 && !r.coach_viewed_at && hoursLeft > 60,
      () => hoursLeft <= 72 && hoursLeft > 30,
      () => hoursLeft <= 30 && hoursLeft > 1,
    ];
    let stage = -1;
    for (let k = r.reminder_count; k < stages.length; k++) if (stages[k]!()) { stage = k; break; }
    // Batched requests (no email yet) ride along with any follow-up going to the same coach.
    if (stage >= 0) due.set(r.coach_id, [...(due.get(r.coach_id) ?? []), { r, stage }]);
  }
  for (const [coachId, items] of due) {
    if (outOfTime()) { out.partial = true; break; }
    await safe("reminder", async () => {
      const coach = await deps.store.getCoach(coachId);
      if (!coach?.email || coach.opted_out) return;
      const claimed: { r: EvalRequest; stage: number }[] = [];
      for (const it of items) {
        const c = await deps.store.casRequest(it.r.id, { status: ["coach_notified", "accepted"] }, { reminder_count: it.stage + 1, last_reminder_at: nowIso });
        if (c) claimed.push({ r: c, stage: it.stage }); // null = coach just responded → skip
      }
      if (!claimed.length) return;
      // Include any other open requests for this coach so the email shows everything waiting.
      const others = (await deps.store.listRequests({ coach_id: coachId, status: ["coach_notified", "accepted"] }))
        .filter((o) => !claimed.some((c) => c.r.id === o.id) && o.expires_at && Date.parse(o.expires_at) > now.getTime());
      const all = [...claimed.map((c) => c.r), ...others].sort((a, b) => a.expires_at!.localeCompare(b.expires_at!));
      const finalDay = claimed.some((c) => c.stage === 2);
      const key = `coach-followup-${coachId}-${claimed.map((c) => `${c.r.id.slice(0, 8)}${c.stage}`).sort().join("")}`.slice(0, 200);
      if (all.length === 1 && all[0]!.format === "ask") {
        const r = all[0]!;
        const hoursLeft = (Date.parse(r.expires_at!) - now.getTime()) / HOUR;
        await sendAskInvite(deps, r, coach, { reminder: { daysLeft: Math.max(1, Math.round(hoursLeft / 24)), nudge: claimed[0]!.stage === 0 }, key });
      } else if (all.length === 1) {
        const r = all[0]!;
        const hoursLeft = (Date.parse(r.expires_at!) - now.getTime()) / HOUR;
        await sendEmail(deps, {
          to: coach.email!,
          rendered: coachInvite({
            req: r, coach, reviewUrl: coachReviewUrl(r), declineUrl: coachDeclineUrl(r),
            unsubscribeUrl: unsubscribeUrl(coach.email!), postalAddress: env.postalAddress(),
            reminder: { daysLeft: Math.max(1, Math.round(hoursLeft / 24)), nudge: claimed[0]!.stage === 0 },
            hubUrl: hubUrl(coach), mailtoUrl: mailtoReply(r), template: replyTemplate(r.format),
          }),
          template: "coach_reminder", idempotencyKey: key, requestId: r.id, coachId: coach.id, marketing: true, replyTo: replyAddress(r),
        });
        await textCoach(deps, coach, r, smsText.coachReminder(r, coachReviewUrl(r), Math.max(1, Math.round(hoursLeft / 24))), `sms-${key}`, "coach_reminder");
      } else {
        await sendEmail(deps, {
          to: coach.email!,
          rendered: coachDigest({
            coach, items: all.map((r) => (r.format === "ask" ? { req: r, url: answerUrl(r, coach), replyUrl: answerUrl(r, coach) } : { req: r, url: coachReviewUrl(r), replyUrl: mailtoReply(r) })), hubUrl: hubUrl(coach),
            unsubscribeUrl: unsubscribeUrl(coach.email!), postalAddress: env.postalAddress(), finalDay,
          }),
          template: "coach_digest", idempotencyKey: key, coachId: coach.id, marketing: true,
        });
        await textCoach(deps, coach, null, smsText.coachDigest(all.length, all.reduce((s, r) => s + r.coach_payout_cents, 0), hubUrl(coach)), `sms-${key}`, "coach_digest");
      }
      out.reminders++;
    });
  }

  // 5b. Weekly "you earned $X" email (each coach at most once every ~7 days, only if they were paid).
  await safe("weekly", async () => { out.weeklySummaries = await sendWeeklySummaries(deps); });

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
