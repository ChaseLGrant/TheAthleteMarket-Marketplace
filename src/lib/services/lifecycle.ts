import { randomUUID } from "node:crypto";
import type { Deps } from "../deps";
import { env } from "../env";
import { paidRequestGate, payoutGate } from "../compliance";
import {
  VIDEO_HARD_MAX_SECONDS, VIDEO_MAX_BYTES, VIDEO_MIME_TYPES, VIDEO_MIN_BYTES, VIDEO_MIN_SECONDS,
} from "../constants";
import {
  coachInvite, coachPaid, coachPayoutSetup, purchaserDelivered, purchaserReceipt, purchaserRefunded, type RefundWhy,
} from "../email/templates";
import { log } from "../log";
import { priceBreakdown } from "../pricing";
import { sourcesFor } from "../state-machine";
import { randomRef } from "../tokens";
import type { Coach, EvalRequest, RequestStatus } from "../types";
import type { RequestInput } from "../validation";
import { adminRequestUrl, coachDeclineUrl, coachReviewUrl, deliveryUrl, payoutsUrl, unsubscribeUrl } from "./links";
import { alertAdmin, sendEmail } from "./notify";

export class UserFacingError extends Error {
  constructor(message: string, public code = "bad_request") {
    super(message);
  }
}

const iso = (d: Date) => d.toISOString();
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

async function event(
  deps: Deps, req: Pick<EvalRequest, "id">, type: string, actor: string,
  from?: RequestStatus | null, to?: RequestStatus | null, data?: Record<string, unknown>,
) {
  try {
    await deps.store.addEvent({ request_id: req.id, type, actor, from_status: from ?? null, to_status: to ?? null, data: data ?? null });
  } catch (e) {
    log("error", "event write failed", { request_id: req.id, type, error: errMsg(e) });
  }
}

async function mustRequest(deps: Deps, id: string) {
  const r = await deps.store.getRequest(id);
  if (!r) throw new Error(`Request not found: ${id}`);
  return r;
}

// ---------------------------------------------------------------------------
// 1. Create request + Stripe Checkout
// ---------------------------------------------------------------------------
export async function createRequestAndCheckout(
  deps: Deps, input: RequestInput, ctx: { ip: string },
): Promise<{ url: string; requestId: string }> {
  const { store } = deps;
  if (!(await store.rateLimit(`checkout:ip:${ctx.ip}`, 3600, 12)))
    throw new UserFacingError("Too many requests from this network. Please try again in an hour.", "rate_limited");
  if (!(await store.rateLimit(`checkout:email:${input.purchaserEmail}`, 3600, 6)))
    throw new UserFacingError("Too many requests for this email. Please try again in an hour.", "rate_limited");

  const coach = await store.getCoachBySlug(input.coachSlug);
  if (!coach) throw new UserFacingError("We couldn't find that coach.", "not_found");
  const settings = await store.getSettings();
  const gate = paidRequestGate(coach, settings, deps.now());
  if (!gate.ok) throw new UserFacingError("This coach isn't accepting paid requests right now.", "coach_unavailable");
  if (await store.isSuppressed(coach.email!))
    throw new UserFacingError("This coach isn't accepting requests right now.", "coach_unavailable");
  if ((await store.countOpenRequestsForCoach(coach.id)) >= settings.max_open_requests_per_coach)
    throw new UserFacingError("This coach is at capacity right now. Please choose another coach or try again in a few days.", "capacity");

  const pb = priceBreakdown(coach.price_cents!, settings);
  const now = deps.now();
  const minor = input.athleteIsMinor === "yes";

  let req: EvalRequest | null = null;
  for (let i = 0; i < 3 && !req; i++) {
    try {
      req = await store.insertRequest({
        ref: randomRef(),
        coach_id: coach.id,
        athlete_name: input.athleteName,
        sport: input.sport,
        position: input.position,
        grad_year: input.gradYear,
        film_url: input.filmUrl,
        athlete_email: input.athleteEmail,
        metrics: input.metrics,
        gpa: input.gpa,
        message: input.message,
        athlete_is_minor: minor,
        purchaser_name: input.purchaserName,
        purchaser_email: input.purchaserEmail,
        purchaser_relationship: input.relationship,
        guardian_consent_at: minor ? iso(now) : null,
        terms_accepted_at: iso(now),
        currency: "usd",
        price_cents: pb.price_cents,
        platform_fee_cents: pb.platform_fee_cents,
        coach_payout_cents: pb.coach_payout_cents,
        utm_source: input.utmSource,
        utm_campaign: input.utmCampaign,
      });
    } catch (e) {
      if (i === 2 || !/duplicate|unique/i.test(errMsg(e))) throw e; // ref collision → retry
    }
  }
  await event(deps, req!, "created", "purchaser", null, "awaiting_payment", { price_cents: pb.price_cents });
  await store.track("checkout_started", coach.id, req!.id).catch(() => {});

  const site = env.siteUrl();
  const session = await deps.payments.createCheckout({
    requestId: req!.id,
    ref: req!.ref,
    coachId: coach.id,
    amountCents: pb.price_cents,
    currency: "usd",
    productName: `Video evaluation from ${coach.full_name}`,
    description: `30–60 second personal video feedback on ${input.athleteName}'s film. Charged only when delivered (within ${settings.deadline_days} days); otherwise the card hold is released.`,
    customerEmail: input.purchaserEmail,
    successUrl: `${site}/request/success?ref=${req!.ref}`,
    cancelUrl: `${site}/coaches/${coach.slug}/request?cancelled=1`,
  });
  await store.casRequest(req!.id, { status: ["awaiting_payment"] }, { stripe_checkout_session_id: session.id });
  return { url: session.url, requestId: req!.id };
}

// ---------------------------------------------------------------------------
// 2. Payment confirmed (Stripe webhook)
// ---------------------------------------------------------------------------
export async function handleCheckoutPaid(
  deps: Deps,
  s: { id: string; payment_status: string; payment_intent: string | null; client_reference_id: string | null; amount_total: number | null; metadata?: Record<string, string> | null },
) {
  // With capture_method=manual, Checkout completes with a card HOLD (PaymentIntent "requires_capture");
  // Stripe may report payment_status "unpaid" for it, so we always confirm with the PaymentIntent itself.
  if (s.payment_status === "no_payment_required") return;
  const requestId = s.client_reference_id ?? s.metadata?.request_id;
  if (!requestId) throw new Error(`Checkout ${s.id} has no request id`);
  const req = await mustRequest(deps, requestId);
  if (!s.payment_intent) throw new Error(`Checkout ${s.id} has no payment_intent`);

  if (req.status === "awaiting_payment" || req.status === "cancelled") {
    const details = await deps.payments.getPaymentDetails(s.payment_intent); // throws → Stripe retries the webhook
    if (details.status !== "requires_capture" && details.status !== "succeeded") return; // not authorized (yet)
    const settings = await deps.store.getSettings();
    const now = deps.now();
    // Coach deadline must end safely before the card hold lapses, so delivery can always be captured.
    let deadline = now.getTime() + settings.deadline_days * 86_400_000;
    if (details.captureBefore) deadline = Math.min(deadline, details.captureBefore.getTime() - 12 * 3_600_000);
    const paid = await deps.store.casRequest(
      req.id,
      { status: ["awaiting_payment", "cancelled"] },
      {
        status: "paid",
        paid_at: iso(now),
        expires_at: iso(new Date(deadline)),
        authorization_expires_at: details.captureBefore ? iso(details.captureBefore) : null,
        payment_captured_at: details.status === "succeeded" ? iso(now) : null,
        stripe_checkout_session_id: s.id,
        stripe_payment_intent_id: s.payment_intent,
        stripe_charge_id: details.chargeId,
        stripe_fee_cents: details.feeCents,
      },
    );
    if (paid) {
      await event(deps, paid, "payment_succeeded", "stripe", req.status, "paid", { amount_total: s.amount_total });
      await deps.store.track("paid", paid.coach_id, paid.id).catch(() => {});
      if (s.amount_total != null && s.amount_total !== paid.price_cents) {
        await alertAdmin(deps, "Checkout amount mismatch", [`${paid.ref}: expected ${paid.price_cents}, got ${s.amount_total}`], adminRequestUrl(paid.id));
      }
      try {
        const coach = await deps.store.getCoach(paid.coach_id);
        await sendEmail(deps, {
          to: paid.purchaser_email,
          rendered: purchaserReceipt({ req: paid, coach: coach!, postalAddress: env.postalAddress() }),
          template: "purchaser_receipt",
          idempotencyKey: `receipt-${paid.id}`,
          requestId: paid.id,
        });
      } catch (e) {
        log("error", "receipt email failed", { request_id: req.id, error: errMsg(e) });
      }
    }
  }
  await notifyCoach(deps, req.id);
}

export async function handleCheckoutExpired(deps: Deps, s: { id: string; client_reference_id: string | null }) {
  const req = s.client_reference_id
    ? await deps.store.getRequest(s.client_reference_id)
    : await deps.store.getRequestBy("stripe_checkout_session_id", s.id);
  if (!req) return;
  const r = await deps.store.casRequest(req.id, { status: ["awaiting_payment"] }, { status: "cancelled" });
  if (r) await event(deps, r, "checkout_expired", "stripe", "awaiting_payment", "cancelled");
}

// ---------------------------------------------------------------------------
// 3. Email the coach (retry-safe: deterministic link + provider idempotency key)
// ---------------------------------------------------------------------------
export async function notifyCoach(deps: Deps, requestId: string) {
  const req = await mustRequest(deps, requestId);
  if (req.status !== "paid") return;
  const coach = (await deps.store.getCoach(req.coach_id))!;
  const settings = await deps.store.getSettings();

  const gate = paidRequestGate(coach, settings, deps.now());
  const suppressed = coach.email ? await deps.store.isSuppressed(coach.email) : true;
  if (!gate.ok || suppressed) {
    await event(deps, req, "coach_unavailable_at_payment", "system", null, null, { reasons: gate.reasons, suppressed });
    await refundRequest(deps, req.id, "unavailable", "system");
    return;
  }
  try {
    const result = await sendEmail(deps, {
      to: coach.email!,
      rendered: coachInvite({
        req, coach,
        reviewUrl: coachReviewUrl(req),
        declineUrl: coachDeclineUrl(req),
        unsubscribeUrl: unsubscribeUrl(coach.email!),
        postalAddress: env.postalAddress(),
      }),
      template: "coach_invite",
      idempotencyKey: `coach-invite-${req.id}`,
      requestId: req.id,
      coachId: coach.id,
      marketing: true,
    });
    if (result === "suppressed") {
      await refundRequest(deps, req.id, "unavailable", "system");
      return;
    }
  } catch (e) {
    await deps.store.casRequest(req.id, { status: ["paid"] }, { last_error: `coach email: ${errMsg(e)}` });
    log("error", "coach invite failed; cron will retry", { request_id: req.id, error: errMsg(e) });
    return;
  }
  const r = await deps.store.casRequest(req.id, { status: ["paid"] }, {
    status: "coach_notified", coach_notified_at: iso(deps.now()), last_error: null,
  });
  if (r) await event(deps, r, "coach_notified", "system", "paid", "coach_notified", { to: coach.email });
}

// ---------------------------------------------------------------------------
// 4. Coach actions (from the magic link)
// ---------------------------------------------------------------------------
export async function markViewed(deps: Deps, req: EvalRequest) {
  if (req.coach_viewed_at) return;
  const r = await deps.store.casRequest(req.id, { status: ["paid", "coach_notified", "accepted"] }, { coach_viewed_at: iso(deps.now()) });
  if (r) await event(deps, r, "coach_viewed", "coach");
}

export async function acceptRequest(deps: Deps, req: EvalRequest) {
  const now = iso(deps.now());
  const r = await deps.store.casRequest(
    req.id, { status: ["paid", "coach_notified"], expiresAfter: now }, { status: "accepted", accepted_at: now },
  );
  if (r) await event(deps, r, "accepted", "coach", req.status, "accepted");
  return r ?? (await mustRequest(deps, req.id));
}

export async function createUploadTarget(deps: Deps, req: EvalRequest, f: { mime: string; size: number }) {
  assertCoachCanAct(req, deps.now());
  const mime = f.mime.split(";")[0]!.trim().toLowerCase() || "video/mp4";
  if (!VIDEO_MIME_TYPES.includes(mime)) throw new UserFacingError("Please use an MP4, MOV or WebM video.");
  if (f.size > VIDEO_MAX_BYTES) throw new UserFacingError("That video is too large (500 MB max). A 60-second clip is plenty!");
  if (f.size < VIDEO_MIN_BYTES) throw new UserFacingError("That video looks empty. Please record again.");
  if (!(await deps.store.rateLimit(`upload:${req.id}`, 3600, 30)))
    throw new UserFacingError("Too many upload attempts. Please wait a few minutes.", "rate_limited");
  const ext = mime === "video/webm" ? "webm" : mime === "video/quicktime" ? "mov" : "mp4";
  const path = `requests/${req.id}/${randomUUID()}.${ext}`;
  const { url } = await deps.storage.createUploadUrl(path);
  return { uploadUrl: url, path, contentType: mime };
}

function assertCoachCanAct(req: EvalRequest, now: Date) {
  if (!["paid", "coach_notified", "accepted"].includes(req.status))
    throw new UserFacingError("This request is no longer open.", "closed");
  if (!req.expires_at || new Date(req.expires_at) <= now)
    throw new UserFacingError("The deadline for this request has passed, so the family was not charged.", "expired");
}

export async function submitVideo(
  deps: Deps, req: EvalRequest, a: { path: string; durationSeconds?: number | null; attest: true },
): Promise<EvalRequest> {
  if (req.status === "submitted" || req.status === "completed") {
    if (req.video_path === a.path) return req; // idempotent double-tap
    throw new UserFacingError("A video was already submitted for this request.", "closed");
  }
  assertCoachCanAct(req, deps.now());
  if (!a.path.startsWith(`requests/${req.id}/`) || a.path.includes("..")) throw new UserFacingError("Invalid upload.");
  if (a.durationSeconds != null && Number.isFinite(a.durationSeconds)) {
    if (a.durationSeconds < VIDEO_MIN_SECONDS) throw new UserFacingError("That video is very short — please record at least 30 seconds.");
    if (a.durationSeconds > VIDEO_HARD_MAX_SECONDS) throw new UserFacingError("Please keep the video under 3 minutes (30–60 seconds is ideal).");
  }
  const stat = await deps.storage.stat(a.path);
  if (!stat) throw new UserFacingError("We couldn't find your upload. Please try submitting again.", "upload_missing");
  if (stat.size < VIDEO_MIN_BYTES) throw new UserFacingError("The uploaded video looks empty. Please record again.");
  if (stat.size > VIDEO_MAX_BYTES) throw new UserFacingError("The uploaded video is too large.");

  const now = iso(deps.now());
  const r = await deps.store.casRequest(
    req.id,
    { status: ["paid", "coach_notified", "accepted"], expiresAfter: now },
    {
      status: "submitted",
      submitted_at: now,
      coach_attested_at: now,
      accepted_at: req.accepted_at ?? now,
      video_path: a.path,
      video_mime: stat.mime,
      video_size_bytes: stat.size,
      video_duration_seconds: a.durationSeconds ?? null,
    },
  );
  if (!r) {
    // Lost the race to expiry/decline/another submit. Never pay for this upload.
    const cur = await mustRequest(deps, req.id);
    if (cur.video_path !== a.path) await deps.storage.remove(a.path).catch(() => {});
    if ((cur.status === "submitted" || cur.status === "completed") && cur.video_path === a.path) return cur;
    throw new UserFacingError(
      cur.status === "expired" || cur.status === "refunded"
        ? "The deadline for this request passed before your video arrived, so the family was not charged."
        : "This request is no longer open.",
      "closed",
    );
  }
  await event(deps, r, "video_submitted", "coach", req.status, "submitted", { size: stat.size, duration: a.durationSeconds ?? null });
  // Charge the held card now, while the hold is guaranteed valid (deadline < hold expiry).
  if (!(await capturePayment(deps, r.id))) return mustRequest(deps, r.id);
  const settings = await deps.store.getSettings();
  if (settings.require_admin_review) {
    await alertAdmin(deps, "Video awaiting review", [`${r.ref} — review before delivery.`], adminRequestUrl(r.id));
    return r;
  }
  return completeRequest(deps, r.id, "system");
}

export async function declineRequest(deps: Deps, req: EvalRequest, reason: string | null, actor = "coach") {
  const r = await deps.store.casRequest(
    req.id,
    { status: ["paid", "coach_notified", "accepted"] },
    { status: "declined", declined_at: iso(deps.now()), decline_reason: reason?.slice(0, 500) ?? null },
  );
  if (r) await event(deps, r, "declined", actor, req.status, "declined", { reason });
  const cur = r ?? (await mustRequest(deps, req.id));
  if (cur.status === "declined") await refundRequest(deps, cur.id, "declined", actor);
  return mustRequest(deps, req.id);
}

// ---------------------------------------------------------------------------
// 5. Fulfillment: verified → delivered → payout
// ---------------------------------------------------------------------------
/**
 * Capture the card hold (the family is charged only here, on delivery). Idempotent.
 * Returns false if capture failed; the request stays `submitted`, admin is alerted, and cron retries.
 */
export async function capturePayment(deps: Deps, requestId: string): Promise<boolean> {
  const req = await mustRequest(deps, requestId);
  if (req.payment_captured_at) return true;
  if (!req.stripe_payment_intent_id) return false;
  try {
    const c = await deps.payments.capture({ paymentIntentId: req.stripe_payment_intent_id, requestId: req.id });
    const r = await deps.store.casRequest(req.id, {}, {
      payment_captured_at: iso(deps.now()), stripe_charge_id: c.chargeId ?? req.stripe_charge_id, stripe_fee_cents: c.feeCents, last_error: null,
    });
    if (r) await event(deps, r, "payment_captured", "system", null, null, { fee: c.feeCents });
    return true;
  } catch (e) {
    await deps.store.casRequest(req.id, {}, { last_error: `capture: ${errMsg(e)}` });
    await event(deps, req, "capture_failed", "system", null, null, { error: errMsg(e) });
    await alertAdmin(deps, "Payment capture failed", [`${req.ref}: ${errMsg(e)}`, "Video is held (not delivered, coach not paid). Will retry; check the payment in Stripe."], adminRequestUrl(req.id));
    return false;
  }
}

export async function completeRequest(deps: Deps, requestId: string, actor: string): Promise<EvalRequest> {
  if (!(await capturePayment(deps, requestId))) return mustRequest(deps, requestId);
  const now = iso(deps.now());
  const r = await deps.store.casRequest(
    requestId,
    { status: ["submitted"], refund_status: ["none"] },
    { status: "completed", completed_at: now, delivered_at: now, payout_status: "pending" },
  );
  if (!r) return mustRequest(deps, requestId);
  await event(deps, r, "completed", actor, "submitted", "completed");
  const coach = (await deps.store.getCoach(r.coach_id))!;
  try {
    await sendEmail(deps, {
      to: r.purchaser_email,
      rendered: purchaserDelivered({ req: r, coach, videoUrl: deliveryUrl(r), postalAddress: env.postalAddress() }),
      template: "purchaser_delivered",
      idempotencyKey: `delivered-${r.id}`,
      requestId: r.id,
    });
  } catch (e) {
    await alertAdmin(deps, "Delivery email failed", [`${r.ref}: ${errMsg(e)}`, "Resend from the admin request page."], adminRequestUrl(r.id));
  }
  await attemptPayout(deps, r.id);
  return mustRequest(deps, r.id);
}

/**
 * Transfer the coach's earnings. Safe to call any number of times, concurrently:
 *  - only a `completed` request with payout pending/blocked/failed can be claimed (CAS → processing)
 *  - an existing transfer for the request's transfer_group is detected before creating one
 *  - Stripe idempotency key `transfer-<request id>` dedupes retries within 24h
 */
export async function attemptPayout(deps: Deps, requestId: string): Promise<EvalRequest> {
  const req = await mustRequest(deps, requestId);
  if (req.status !== "completed" || !["pending", "blocked", "failed"].includes(req.payout_status)) return req;
  if (!req.payment_captured_at) return req; // never pay a coach for money we haven't collected

  if (req.stripe_dispute_id && req.dispute_status !== "won") {
    await deps.store.casRequest(req.id, { payout_status: ["pending", "failed"] }, { payout_status: "blocked", payout_block_reason: "Payment is under dispute" });
    return mustRequest(deps, req.id);
  }

  let coach = (await deps.store.getCoach(req.coach_id))!;
  if (coach.stripe_account_id) coach = await syncAccount(deps, coach);
  const settings = await deps.store.getSettings();
  const gate = payoutGate(coach, settings, deps.now());

  if (!gate.ok) {
    const blocked = await deps.store.casRequest(
      req.id, { status: ["completed"], payout_status: ["pending", "blocked", "failed"] },
      { payout_status: "blocked", payout_block_reason: gate.reasons.join(" ") },
    );
    if (blocked && req.payout_status !== "blocked") await event(deps, blocked, "payout_blocked", "system", null, null, { reasons: gate.reasons });
    const needsOnboarding = gate.reasons.some((x) => /payout setup/i.test(x));
    if (blocked && needsOnboarding && !blocked.onboarding_email_sent_at && coach.email) {
      try {
        await sendEmail(deps, {
          to: coach.email,
          rendered: coachPayoutSetup({ coach, amountCents: req.coach_payout_cents, setupUrl: payoutsUrl(coach), postalAddress: env.postalAddress() }),
          template: "coach_payout_setup",
          idempotencyKey: `payout-setup-${req.id}`,
          requestId: req.id,
          coachId: coach.id,
        });
        await deps.store.casRequest(req.id, {}, { onboarding_email_sent_at: iso(deps.now()) });
      } catch (e) {
        log("error", "payout setup email failed", { request_id: req.id, error: errMsg(e) });
      }
    }
    return mustRequest(deps, req.id);
  }

  const claimed = await deps.store.casRequest(
    req.id,
    { status: ["completed"], payout_status: ["pending", "blocked", "failed"], refund_status: ["none"] },
    { payout_status: "processing", payout_attempts: req.payout_attempts + 1, payout_block_reason: null },
  );
  if (!claimed) return mustRequest(deps, req.id);

  const group = `req_${req.id}`;
  try {
    const existing = await deps.payments.findTransferForGroup(group);
    const transfer = existing ?? (await deps.payments.transfer({
      requestId: req.id,
      amountCents: req.coach_payout_cents,
      currency: req.currency,
      destination: coach.stripe_account_id!,
      sourceTransaction: req.stripe_charge_id,
      group,
    }));
    const paid = await deps.store.casRequest(req.id, { payout_status: ["processing"] }, {
      payout_status: "paid", stripe_transfer_id: transfer.id, paid_out_at: iso(deps.now()), last_error: null,
    });
    if (paid) {
      await event(deps, paid, "payout_sent", "system", null, null, { transfer: transfer.id, amount: req.coach_payout_cents });
      try {
        await sendEmail(deps, {
          to: coach.email!,
          rendered: coachPaid({ req: paid, coach, dashboardUrl: payoutsUrl(coach), postalAddress: env.postalAddress() }),
          template: "coach_paid",
          idempotencyKey: `coach-paid-${req.id}`,
          requestId: req.id,
          coachId: coach.id,
        });
      } catch (e) {
        log("warn", "coach paid email failed", { request_id: req.id, error: errMsg(e) });
      }
    }
  } catch (e) {
    await deps.store.casRequest(req.id, { payout_status: ["processing"] }, { payout_status: "failed", last_error: `transfer: ${errMsg(e)}` });
    await event(deps, req, "payout_failed", "system", null, null, { error: errMsg(e) });
    await alertAdmin(deps, "Coach payout failed", [`${req.ref}: ${errMsg(e)}`, "Will retry automatically."], adminRequestUrl(req.id));
  }
  return mustRequest(deps, req.id);
}

/** Refresh a coach's Stripe Connect capability flags. */
export async function syncAccount(deps: Deps, coach: Coach): Promise<Coach> {
  if (!coach.stripe_account_id) return coach;
  try {
    const s = await deps.payments.getAccountStatus(coach.stripe_account_id);
    if (
      s.payoutsEnabled !== coach.stripe_payouts_enabled ||
      s.transfersActive !== coach.stripe_transfers_active ||
      s.detailsSubmitted !== coach.stripe_details_submitted
    ) {
      return deps.store.updateCoach(coach.id, {
        stripe_payouts_enabled: s.payoutsEnabled,
        stripe_transfers_active: s.transfersActive,
        stripe_details_submitted: s.detailsSubmitted,
      });
    }
  } catch (e) {
    log("warn", "account sync failed", { coach_id: coach.id, error: errMsg(e) });
  }
  return coach;
}

export async function retryPayoutsForCoach(deps: Deps, coachId: string) {
  const list = await deps.store.listRequests({ coach_id: coachId, status: ["completed"], payout_status: ["pending", "blocked", "failed"] });
  for (const r of list) await attemptPayout(deps, r.id);
}

// ---------------------------------------------------------------------------
// 6. Refunds (decline, expiry, unavailable coach, admin)
// ---------------------------------------------------------------------------
export async function refundRequest(deps: Deps, requestId: string, why: RefundWhy, actor: string): Promise<EvalRequest> {
  const req = await mustRequest(deps, requestId);
  if (req.refund_status === "succeeded" || req.status === "refunded") return req;
  if (!req.stripe_payment_intent_id) return req; // never paid
  if (req.payout_status === "paid" || req.payout_status === "processing") {
    await alertAdmin(deps, "Refund blocked: coach already paid", [`${req.ref}: reverse the transfer first, then refund.`], adminRequestUrl(req.id));
    throw new UserFacingError("Coach has already been paid — reverse the transfer before refunding.", "payout_exists");
  }
  const captured = !!req.payment_captured_at;
  // Claim the refund AND neutralize any pending payout in one atomic update.
  const claimed = await deps.store.casRequest(
    req.id,
    { refund_status: ["none", "failed"], payout_status: ["none", "pending", "blocked", "failed", "reversed"] },
    { refund_status: "processing", refund_attempts: req.refund_attempts + 1, payout_status: req.payout_status === "reversed" ? "reversed" : "none" },
  );
  if (!claimed) return mustRequest(deps, req.id);
  try {
    // Not yet charged → just release the card hold: no charge, no Stripe fee.
    // Already charged (rare, admin-initiated) → a real refund; Stripe keeps its processing fee.
    let refund: { id: string | null };
    if (captured) refund = await deps.payments.refund({ paymentIntentId: req.stripe_payment_intent_id, requestId: req.id, reason: why });
    else {
      await deps.payments.releaseHold({ paymentIntentId: req.stripe_payment_intent_id, requestId: req.id });
      refund = { id: null };
    }
    const done = await deps.store.casRequest(
      req.id,
      { refund_status: ["processing"], status: sourcesFor("refunded") },
      { status: "refunded", refund_status: "succeeded", refunded_at: iso(deps.now()), stripe_refund_id: refund.id, last_error: null },
    );
    if (done) {
      await event(deps, done, captured ? "refunded" : "hold_released", actor, req.status, "refunded", { why, refund: refund.id });
      // Revoke any delivery link. The coach link stays valid so it can show a friendly "closed" page;
      // every coach action re-checks status, so it can no longer submit or trigger payment.
      await deps.store.casRequest(req.id, {}, { delivery_link_nonce: randomUUID().replace(/-/g, "") });
      try {
        const coach = (await deps.store.getCoach(done.coach_id))!;
        await sendEmail(deps, {
          to: done.purchaser_email,
          rendered: purchaserRefunded({ req: done, coach, why, captured, postalAddress: env.postalAddress() }),
          template: "purchaser_refunded",
          idempotencyKey: `refund-email-${done.id}`,
          requestId: done.id,
        });
      } catch (e) {
        log("error", "refund email failed", { request_id: req.id, error: errMsg(e) });
      }
    }
  } catch (e) {
    await deps.store.casRequest(req.id, { refund_status: ["processing"] }, { refund_status: "failed", last_error: `refund: ${errMsg(e)}` });
    await event(deps, req, "refund_failed", actor, null, null, { error: errMsg(e) });
    await alertAdmin(deps, "Refund failed", [`${req.ref}: ${errMsg(e)}`, "Will retry automatically."], adminRequestUrl(req.id));
  }
  return mustRequest(deps, req.id);
}

/** Admin-only: pull back a coach payout (e.g. after a lost dispute or invalid video). */
export async function reversePayout(deps: Deps, requestId: string) {
  const req = await mustRequest(deps, requestId);
  if (req.payout_status !== "paid" || !req.stripe_transfer_id) throw new UserFacingError("No completed payout to reverse.");
  await deps.payments.reverseTransfer(req.stripe_transfer_id, req.id);
  const r = await deps.store.casRequest(req.id, { payout_status: ["paid"] }, { payout_status: "reversed" });
  if (r) await event(deps, r, "payout_reversed", "admin", null, null, { transfer: req.stripe_transfer_id });
  return mustRequest(deps, req.id);
}

// ---------------------------------------------------------------------------
// 7. Stripe-originated changes (dashboard refunds, disputes, Connect)
// ---------------------------------------------------------------------------
export async function handleChargeRefunded(deps: Deps, c: { payment_intent: string | null; refunded: boolean; id: string }) {
  if (!c.payment_intent || !c.refunded) return;
  const req = await deps.store.getRequestBy("stripe_payment_intent_id", c.payment_intent);
  if (!req || req.status === "refunded") return;
  await deps.store.casRequest(req.id, { payout_status: ["pending", "blocked", "failed"] }, { payout_status: "none" });
  const r = await deps.store.casRequest(req.id, { status: sourcesFor("refunded") }, {
    status: "refunded", refund_status: "succeeded", refunded_at: iso(deps.now()),
  });
  if (r) {
    await event(deps, r, "refunded_externally", "stripe", req.status, "refunded", { charge: c.id });
    if (r.payout_status === "paid")
      await alertAdmin(deps, "Charge refunded after coach payout", [`${r.ref}: consider reversing transfer ${r.stripe_transfer_id}.`], adminRequestUrl(r.id));
  }
}

export async function handleDispute(
  deps: Deps,
  d: { id: string; charge: string | null; payment_intent: string | null; amount: number; reason: string | null; status: string },
) {
  const req =
    (d.payment_intent && (await deps.store.getRequestBy("stripe_payment_intent_id", d.payment_intent))) ||
    (d.charge && (await deps.store.getRequestBy("stripe_charge_id", d.charge))) ||
    null;
  await deps.store.upsertDispute({ id: d.id, request_id: req?.id ?? null, amount_cents: d.amount, reason: d.reason, status: d.status });
  if (!req) return;
  await deps.store.casRequest(req.id, {}, { stripe_dispute_id: d.id, dispute_status: d.status });
  if (d.status !== "won" && d.status !== "warning_closed") {
    await deps.store.casRequest(req.id, { payout_status: ["pending", "failed"] }, { payout_status: "blocked", payout_block_reason: "Payment is under dispute" });
  }
  await event(deps, req, "dispute_" + d.status, "stripe", null, null, { dispute: d.id, reason: d.reason });
  await alertAdmin(deps, `Dispute ${d.status}`, [`${req.ref}: ${d.reason ?? "no reason"} — ${d.amount / 100} USD`, `Payout status: ${req.payout_status}`], adminRequestUrl(req.id));
  if (d.status === "won") {
    await deps.store.casRequest(req.id, {}, { dispute_status: "won" });
    await attemptPayout(deps, req.id);
  }
}

export async function handleAccountUpdated(deps: Deps, accountId: string) {
  const coach = await deps.store.getCoachByStripeAccount(accountId);
  if (!coach) return;
  const updated = await syncAccount(deps, coach);
  if (updated.stripe_transfers_active) await retryPayoutsForCoach(deps, coach.id);
}

/** Coach clicked the payouts link: create (or reuse) their Express account and get a hosted onboarding URL. */
export async function startOnboarding(deps: Deps, coach: Coach, urls: { refreshUrl: string; returnUrl: string }) {
  if (!coach.email) throw new UserFacingError("No email on file for this coach.");
  let acct = coach.stripe_account_id;
  if (!acct) {
    acct = (await deps.payments.createConnectAccount({ coachId: coach.id, email: coach.email, name: coach.full_name })).id;
    await deps.store.updateCoach(coach.id, { stripe_account_id: acct });
  }
  return deps.payments.createOnboardingLink({ accountId: acct, ...urls });
}

/** Coach (or anyone) asked never to receive email again: suppress + decline & refund their open requests. */
export async function unsubscribeEmail(deps: Deps, email: string) {
  await deps.store.suppress(email, "unsubscribe_link");
  for (const c of await deps.store.findCoachesByEmail(email)) {
    await deps.store.updateCoach(c.id, { opted_out: true });
    const open = await deps.store.listRequests({ coach_id: c.id, status: ["paid", "coach_notified", "accepted"] });
    for (const r of open) await declineRequest(deps, r, "Coach opted out of emails", "system");
  }
}
