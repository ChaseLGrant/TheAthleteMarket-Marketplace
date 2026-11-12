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
  const { id } = await d.payments.createConnectAccount({ coachId, email: "pat@example.com", name: "Pat" });
  await d.store.updateCoach(coachId, { stripe_account_id: id });
  d.payments.completeOnboarding(id);
  await handleAccountUpdated(d, id);
}

describe("checkout", () => {
  it("refuses coaches that fail the compliance gate", async () => {
    const { deps } = makeDeps();
    await addCoach(deps, { eligibility_status: "pending_review" });
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
    for (let i = 0; i < 12; i++) await createRequestAndCheckout(deps, input({ purchaserEmail: `p${i}@example.com` }), { ip: "9.9.9.9" });
    await expect(createRequestAndCheckout(deps, input({ purchaserEmail: "z@example.com" }), { ip: "9.9.9.9" })).rejects.toThrow(/Too many/);
  });
});

describe("payment webhook", () => {
  it("marks paid, sets 7-day deadline, emails coach once and purchaser once, even when delivered twice", async () => {
    const { deps } = makeDeps();
    const coach = await addCoach(deps);
    const req = await paidRequest(deps);
    expect(req.status).toBe("coach_notified");
    expect(new Date(req.expires_at!).getTime() - new Date(req.paid_at!).getTime()).toBe(7 * 86_400_000);
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
    await deps.store.updateCoach(coach.id, { eligibility_status: "suspended" });
    await handleCheckoutPaid(deps, { id: "cs", payment_status: "paid", payment_intent: `pi_demo_${requestId}`, client_reference_id: requestId, amount_total: 4000 });
    const r = (await deps.store.getRequest(requestId))!;
    expect(r.status).toBe("refunded");
    expect(deps.payments.refunds).toHaveLength(1);
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
    expect(deps.mailer.sent.filter((m) => m.to === "pat@example.com" && m.subject.startsWith("New paid"))).toHaveLength(1);
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
    expect(deps.payments.refunds).toHaveLength(1);
    expect(deps.mailer.sent.filter((m) => m.subject.startsWith("Full refund"))).toHaveLength(1);
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
    expect(deps.mailer.sent.filter((m) => m.to === "parent@example.com" && /sent .*evaluation/.test(m.subject))).toHaveLength(1);
  });
});

describe("decline + refunds", () => {
  it("decline refunds in full exactly once and kills the coach link", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    await Promise.all([declineRequest(deps, req, "busy"), declineRequest(deps, req, "busy")]);
    const r = (await deps.store.getRequest(req.id))!;
    expect(r.status).toBe("refunded");
    expect(r.coach_link_nonce).not.toBe(req.coach_link_nonce);
    expect(deps.payments.refunds).toHaveLength(1);
    const path = await upload(deps, req.id);
    await expect(submitVideo(deps, r, { path, durationSeconds: 45, attest: true })).rejects.toThrow();
  });

  it("failed refunds are retried by cron until they succeed", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    deps.payments.failRefunds = true;
    await declineRequest(deps, req, null);
    expect((await deps.store.getRequest(req.id))!.refund_status).toBe("failed");
    deps.payments.failRefunds = false;
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
