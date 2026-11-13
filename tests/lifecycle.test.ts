import { describe, expect, it } from "vitest";
import {
  acceptRequest, attemptPayout, createRequestAndCheckout, declineRequest, handleAccountUpdated,
  handleCheckoutPaid, handleDispute, refundRequest, submitVideo, unsubscribeEmail,
} from "@/lib/services/lifecycle";
import { runCron } from "@/lib/services/cron";
import { processStripeEvent } from "@/lib/services/webhooks";
import { addCoach, input, makeDeps, paidRequest, upload } from "./helpers";
import type Stripe from "stripe";

async function onboard(d: ReturnType<typeof makeDeps>["deps"], coachId: string) {
  const { id } = await d.payments.createConnectAccount({ coachId, email: "pat@example.com", name: "Pat Coach" });
  await d.store.updateCoach(coachId, { stripe_account_id: id });
  d.payments.completeOnboarding(id);
  await handleAccountUpdated(d, id);
}

describe("checkout", () => {
  it("refuses coaches who can't be requested (removed listing)", async () => {
    const { deps } = makeDeps();
    await addCoach(deps, { removed: true });
    await expect(createRequestAndCheckout(deps, input(), { ip: "x" })).rejects.toThrow(/isn't accepting/);
    expect(deps.payments.sessions.size).toBe(0);
  });
  it("enforces coach capacity", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    await deps.store.updateSettings({ max_open_requests_per_coach: 1 });
    await paidRequest(deps);
    await expect(createRequestAndCheckout(deps, input({ purchaserEmail: "b@example.com" }), { ip: "y" })).rejects.toThrow(/capacity/);
  });
  it("rate limits by IP", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    await deps.store.updateSettings({ max_open_requests_per_coach: 1000 });
    for (let i = 0; i < 40; i++) await createRequestAndCheckout(deps, input({ purchaserEmail: `p${i}@example.com` }), { ip: "9.9.9.9" });
    await expect(createRequestAndCheckout(deps, input({ purchaserEmail: "z@example.com" }), { ip: "9.9.9.9" })).rejects.toThrow(/Too many/);
  });
});

describe("payment webhook", () => {
  it("marks paid, sets 5-day deadline, emails coach once and purchaser once, even when delivered twice", async () => {
    const { deps } = makeDeps();
    const coach = await addCoach(deps);
    const req = await paidRequest(deps);
    expect(req.status).toBe("coach_notified");
    expect(new Date(req.expires_at!).getTime() - new Date(req.paid_at!).getTime()).toBe(5 * 86_400_000);
    await handleCheckoutPaid(deps, { id: req.stripe_checkout_session_id!, payment_status: "paid", payment_intent: req.stripe_payment_intent_id, client_reference_id: req.id, amount_total: 4000 });
    const invites = deps.mailer.sent.filter((m) => m.to === coach.email);
    expect(invites).toHaveLength(1);
    expect(invites[0]!.headers?.["List-Unsubscribe"]).toBeTruthy();
    expect(invites[0]!.html).toContain("/r/");
    expect(invites[0]!.html).not.toContain("GPA");
    expect(deps.mailer.sent.filter((m) => m.to === "parent@example.com")).toHaveLength(1);
  });

  it("dedupes Stripe events by id", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const { requestId } = await createRequestAndCheckout(deps, input(), { ip: "x" });
    deps.payments.authorize(`pi_demo_${requestId}`);
    const evt = {
      id: "evt_1", type: "checkout.session.completed",
      data: { object: { id: "cs_1", payment_status: "paid", payment_intent: `pi_demo_${requestId}`, client_reference_id: requestId, amount_total: 4000, metadata: {} } },
    } as unknown as Stripe.Event;
    expect(await processStripeEvent(deps, evt)).toBe("processed");
    expect(await processStripeEvent(deps, evt)).toBe("duplicate");
    expect((await deps.store.getRequest(requestId))!.status).toBe("coach_notified");
  });

  it("ignores unpaid (async) sessions until paid", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const { requestId } = await createRequestAndCheckout(deps, input(), { ip: "x" });
    await handleCheckoutPaid(deps, { id: "cs", payment_status: "unpaid", payment_intent: "pi_x", client_reference_id: requestId, amount_total: 4000 });
    expect((await deps.store.getRequest(requestId))!.status).toBe("awaiting_payment");
  });

  it("refunds automatically if the coach became ineligible between checkout and payment", async () => {
    const { deps } = makeDeps();
    const coach = await addCoach(deps);
    const { requestId } = await createRequestAndCheckout(deps, input(), { ip: "x" });
    await deps.store.updateCoach(coach.id, { removed: true });
    deps.payments.authorize(`pi_demo_${requestId}`);
    await handleCheckoutPaid(deps, { id: "cs", payment_status: "paid", payment_intent: `pi_demo_${requestId}`, client_reference_id: requestId, amount_total: 4000 });
    const r = (await deps.store.getRequest(requestId))!;
    expect(r.status).toBe("refunded");
    expect(deps.payments.releases).toHaveLength(1); // hold released, never charged
    expect(deps.payments.refunds).toHaveLength(0);
  });

  it("retries a failed coach email from cron without duplicating", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    deps.mailer.fail = true;
    const req = await paidRequest(deps);
    expect(req.status).toBe("paid");
    deps.mailer.fail = false;
    await runCron(deps);
    expect((await deps.store.getRequest(req.id))!.status).toBe("coach_notified");
    await runCron(deps);
    expect(deps.mailer.sent.filter((m) => m.to === "pat@example.com" && m.subject.startsWith("$40 for a video breakdown"))).toHaveLength(1);
  });
});

describe("fulfillment + payout", () => {
  it("full happy path: accept → submit → delivered → payout blocked until onboarding → paid exactly once", async () => {
    const { deps } = makeDeps();
    const coach = await addCoach(deps);
    let req = await paidRequest(deps);
    req = await acceptRequest(deps, req);
    expect(req.status).toBe("accepted");
    const path = await upload(deps, req.id);
    req = await submitVideo(deps, req, { path, durationSeconds: 45, attest: true });
    expect(req.status).toBe("completed");
    expect(req.payout_status).toBe("blocked");
    expect(deps.mailer.sent.some((m) => m.subject.includes("ready") || m.subject.includes("sent"))).toBe(true);
    expect(deps.mailer.sent.some((m) => m.subject.startsWith("Claim your"))).toBe(true);
    expect(deps.payments.transfers).toHaveLength(0);

    await onboard(deps, coach.id);
    req = (await deps.store.getRequest(req.id))!;
    expect(req.payout_status).toBe("paid");
    expect(deps.payments.transfers).toHaveLength(1);
    expect(deps.payments.transfers[0]!.amountCents).toBe(4000);
    expect(deps.payments.captures).toHaveLength(1);

    // Repeated / concurrent payout attempts never double pay
    await Promise.all([attemptPayout(deps, req.id), attemptPayout(deps, req.id), runCron(deps)]);
    expect(deps.payments.transfers).toHaveLength(1);
  });

  it("concurrent payouts on an onboarded coach create one transfer", async () => {
    const { deps } = makeDeps();
    const coach = await addCoach(deps);
    await onboard(deps, coach.id);
    const req = await paidRequest(deps);
    const path = await upload(deps, req.id);
    await deps.store.updateSettings({ require_admin_review: true });
    await submitVideo(deps, req, { path, durationSeconds: 40, attest: true });
    await deps.store.casRequest(req.id, { status: ["submitted"] }, { status: "completed", payout_status: "pending" });
    await Promise.all(Array.from({ length: 5 }, () => attemptPayout(deps, req.id)));
    expect(deps.payments.transfers).toHaveLength(1);
  });

  it("rejects submissions after the deadline and does not pay", async () => {
    const { deps, advance } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    const path = await upload(deps, req.id);
    advance(7 * 24 + 1);
    await expect(submitVideo(deps, req, { path, durationSeconds: 45, attest: true })).rejects.toThrow(/deadline/);
    expect(deps.payments.transfers).toHaveLength(0);
  });

  it("expiry cron refunds once, and a late submit after expiry is refused", async () => {
    const { deps, advance } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    advance(7 * 24 + 1);
    await runCron(deps);
    await runCron(deps);
    const r = (await deps.store.getRequest(req.id))!;
    expect(r.status).toBe("refunded");
    expect(deps.payments.releases).toHaveLength(1);
    expect(deps.payments.captures).toHaveLength(0);
    expect(deps.mailer.sent.filter((m) => m.subject.startsWith("You weren't charged"))).toHaveLength(1);
    const path = await upload(deps, req.id);
    await expect(submitVideo(deps, r, { path, durationSeconds: 45, attest: true })).rejects.toThrow();
  });

  it("rejects tiny/oversize/foreign uploads", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    const small = await upload(deps, req.id, 100);
    await expect(submitVideo(deps, req, { path: small, durationSeconds: 45, attest: true })).rejects.toThrow(/empty/);
    await expect(submitVideo(deps, req, { path: "requests/other/x.mp4", durationSeconds: 45, attest: true })).rejects.toThrow(/Invalid/);
    const ok = await upload(deps, req.id);
    await expect(submitVideo(deps, req, { path: ok, durationSeconds: 3, attest: true })).rejects.toThrow(/short/);
  });

  it("double-submit of the same upload is idempotent", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    const path = await upload(deps, req.id);
    const [a, b] = await Promise.allSettled([
      submitVideo(deps, req, { path, durationSeconds: 45, attest: true }),
      submitVideo(deps, req, { path, durationSeconds: 45, attest: true }),
    ]);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("fulfilled");
    expect(deps.mailer.sent.filter((m) => m.to === "parent@example.com" && /replied/.test(m.subject))).toHaveLength(1);
  });
});

describe("decline + refunds", () => {
  it("decline refunds in full exactly once and the coach can no longer submit", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    await Promise.all([declineRequest(deps, req, "busy"), declineRequest(deps, req, "busy")]);
    const r = (await deps.store.getRequest(req.id))!;
    expect(r.status).toBe("refunded");
    expect(deps.payments.releases).toHaveLength(1);
    expect(deps.payments.refunds).toHaveLength(0);
    const path = await upload(deps, req.id);
    await expect(submitVideo(deps, r, { path, durationSeconds: 45, attest: true })).rejects.toThrow();
  });

  it("failed hold releases are retried by cron until they succeed", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    deps.payments.failRelease = true;
    await declineRequest(deps, req, null);
    expect((await deps.store.getRequest(req.id))!.refund_status).toBe("failed");
    deps.payments.failRelease = false;
    await runCron(deps);
    expect((await deps.store.getRequest(req.id))!.status).toBe("refunded");
  });

  it("will not refund after the coach was paid (must reverse first)", async () => {
    const { deps } = makeDeps();
    const coach = await addCoach(deps);
    await onboard(deps, coach.id);
    const req = await paidRequest(deps);
    await submitVideo(deps, req, { path: await upload(deps, req.id), durationSeconds: 45, attest: true });
    expect((await deps.store.getRequest(req.id))!.payout_status).toBe("paid");
    await expect(refundRequest(deps, req.id, "admin", "admin")).rejects.toThrow(/reverse/);
  });

  it("opt-out suppresses email and refunds the coach's open requests", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    await unsubscribeEmail(deps, "PAT@example.com");
    expect((await deps.store.getRequest(req.id))!.status).toBe("refunded");
    await expect(createRequestAndCheckout(deps, input({ purchaserEmail: "n@example.com" }), { ip: "z" })).rejects.toThrow();
  });
});

describe("disputes", () => {
  it("blocks payout while disputed and releases if won", async () => {
    const { deps } = makeDeps();
    const coach = await addCoach(deps);
    const req = await paidRequest(deps);
    await handleDispute(deps, { id: "dp_1", charge: null, payment_intent: req.stripe_payment_intent_id, amount: 4000, reason: "fraudulent", status: "needs_response" });
    await submitVideo(deps, req, { path: await upload(deps, req.id), durationSeconds: 45, attest: true });
    await onboard(deps, coach.id);
    expect((await deps.store.getRequest(req.id))!.payout_status).toBe("blocked");
    expect(deps.payments.transfers).toHaveLength(0);
    await handleDispute(deps, { id: "dp_1", charge: null, payment_intent: req.stripe_payment_intent_id, amount: 4000, reason: "fraudulent", status: "won" });
    expect((await deps.store.getRequest(req.id))!.payout_status).toBe("paid");
  });
});

describe("card hold: charge only on delivery", () => {
  it("never emails the coach unless the card hold actually succeeded (bad card = no work)", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const { requestId } = await createRequestAndCheckout(deps, input(), { ip: "x" });
    // Card declined / never authorized: Stripe would not complete checkout, but even a stray event must not trigger work.
    await handleCheckoutPaid(deps, { id: "cs", payment_status: "paid", payment_intent: `pi_demo_${requestId}`, client_reference_id: requestId, amount_total: 4000 });
    expect((await deps.store.getRequest(requestId))!.status).toBe("awaiting_payment");
    expect(deps.mailer.sent.filter((m) => m.to === "pat@example.com")).toHaveLength(0);
  });

  it("holds at checkout, charges only when the coach submits", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    expect(req.payment_captured_at).toBeNull();
    expect(deps.payments.captures).toHaveLength(0);
    const done = await submitVideo(deps, req, { path: await upload(deps, req.id), durationSeconds: 40, attest: true });
    expect(done.status).toBe("completed");
    expect(done.payment_captured_at).not.toBeNull();
    expect(deps.payments.captures).toEqual([req.stripe_payment_intent_id]);
  });

  it("if the charge fails, the family does not get the video and the coach is not paid; cron retries", async () => {
    const { deps } = makeDeps();
    const coach = await addCoach(deps);
    await onboard(deps, coach.id);
    const req = await paidRequest(deps);
    deps.payments.failCapture = true;
    const r = await submitVideo(deps, req, { path: await upload(deps, req.id), durationSeconds: 40, attest: true });
    expect(r.status).toBe("submitted");
    expect(deps.mailer.sent.some((m) => m.to === "parent@example.com" && /replied/.test(m.subject))).toBe(false);
    expect(deps.payments.transfers).toHaveLength(0);
    deps.payments.failCapture = false;
    await runCron(deps);
    const after = (await deps.store.getRequest(req.id))!;
    expect(after.status).toBe("completed");
    expect(after.payout_status).toBe("paid");
  });

  it("declines and expiries cost $0 in Stripe fees", async () => {
    const { deps, advance } = makeDeps();
    await addCoach(deps);
    const a = await paidRequest(deps);
    await declineRequest(deps, a, null);
    await paidRequest(deps, { purchaserEmail: "b@example.com" });
    advance(6 * 24);
    await runCron(deps);
    expect(deps.payments.captures).toHaveLength(0);
    expect(deps.payments.refunds).toHaveLength(0);
    expect(deps.payments.releases).toHaveLength(2);
  });

  it("deadline ends before the card hold expires so delivery can always be charged", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    await deps.store.updateSettings({ deadline_days: 6 });
    const captureBefore = new Date(deps.now().getTime() + 5 * 86_400_000);
    const orig = deps.payments.getPaymentDetails.bind(deps.payments);
    deps.payments.getPaymentDetails = async (pi: string) => ({ ...(await orig(pi)), captureBefore });
    const req = await paidRequest(deps);
    expect(Date.parse(req.expires_at!)).toBe(captureBefore.getTime() - 12 * 3_600_000);
  });

  it("an already-lapsed hold still closes the request cleanly", async () => {
    const { deps, advance } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    deps.payments.intents.set(req.stripe_payment_intent_id!, "canceled"); // bank dropped the hold on its own
    advance(6 * 24);
    await runCron(deps);
    expect((await deps.store.getRequest(req.id))!.status).toBe("refunded");
  });
});

import { resolveDeliveryLink } from "@/lib/services/access";
import { deliveryUrl } from "@/lib/services/links";

describe("video retention", () => {
  async function delivered() {
    const h = makeDeps();
    await addCoach(h.deps);
    const req = await paidRequest(h.deps);
    const done = await submitVideo(h.deps, req, { path: await upload(h.deps, req.id), durationSeconds: 40, attest: true });
    return { ...h, req: done };
  }
  const tokenOf = (r: Parameters<typeof deliveryUrl>[0]) => deliveryUrl(r).split("/v/")[1]!;

  it("tells the family the deletion date and to download", async () => {
    const { deps } = await delivered();
    const email = deps.mailer.sent.find((m) => m.to === "parent@example.com" && /replied/.test(m.subject))!;
    expect(email.html).toContain("Download it to keep it");
    expect(email.text).toMatch(/deleted after/);
  });

  it("deletes the video file 30 days after delivery, not before; the link then explains it was deleted", async () => {
    const { deps, advance, req } = await delivered();
    advance(29 * 24);
    await runCron(deps);
    expect(deps.storage.files.size).toBe(1);
    advance(2 * 24);
    await runCron(deps);
    expect(deps.storage.files.size).toBe(0);
    const after = (await deps.store.getRequest(req.id))!;
    expect(after.video_path).toBeNull();
    expect(after.video_deleted_at).not.toBeNull();
    expect(after.video_size_bytes).toBeGreaterThan(0); // proof-of-delivery record kept
    const link = await resolveDeliveryLink(deps, tokenOf(after));
    expect(link?.req.video_path).toBeNull();
  });

  it("keeps the video while a chargeback is open", async () => {
    const { deps, advance, req } = await delivered();
    await handleDispute(deps, { id: "dp_9", charge: null, payment_intent: req.stripe_payment_intent_id, amount: 4000, reason: "product_not_received", status: "needs_response" });
    advance(40 * 24);
    await runCron(deps);
    expect(deps.storage.files.size).toBe(1);
    await handleDispute(deps, { id: "dp_9", charge: null, payment_intent: req.stripe_payment_intent_id, amount: 4000, reason: "product_not_received", status: "won" });
    await runCron(deps);
    expect(deps.storage.files.size).toBe(0);
  });
});
