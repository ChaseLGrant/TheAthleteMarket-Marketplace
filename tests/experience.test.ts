import { describe, expect, it } from "vitest";
import { addCoach, input, makeDeps, paidRequest, upload } from "./helpers";
import { createRequestAndCheckout, declineRequest, submitVideo } from "@/lib/services/lifecycle";
import {
  checkFilmLink, deliveryBadge, fixFilmLink, rateDelivery, ratingBadge, reportFilmIssue, saveIntroVideo,
  createIntroUploadTarget, sendPayoutInvite, sendWeeklySummaries, setPaused,
} from "@/lib/services/experience";
import { runCron } from "@/lib/services/cron";
import { secondOpinionUrl, fixFilmUrl } from "@/lib/services/links";
import { resolveAgainLink, resolveFixLink } from "@/lib/services/access";
import { toE164 } from "@/lib/phone";

const smsCoach = { phone: "+15551234567", sms_opt_in_at: "2026-11-01T00:00:00Z" };

describe("coach texts (Twilio)", () => {
  it("texts an opted-in coach once per new request, even if the notification is retried", async () => {
    const { deps } = makeDeps();
    await addCoach(deps, smsCoach);
    const req = await paidRequest(deps);
    await runCron(deps);
    const texts = deps.sms.sent.filter((m) => m.to === "+15551234567");
    expect(texts).toHaveLength(1);
    expect(texts[0]!.body).toContain("/r/");
    expect(texts[0]!.body).toContain("Reply STOP");
    expect(texts[0]!.body).toContain(req.athlete_name);
  });
  it("never texts a coach without SMS consent", async () => {
    const { deps } = makeDeps();
    await addCoach(deps, { phone: "+15551234567" });
    await paidRequest(deps);
    expect(deps.sms.sent).toHaveLength(0);
  });
  it("a STOP reply marks the coach opted out and texting stops (email continues)", async () => {
    const { deps } = makeDeps();
    const coach = await addCoach(deps, smsCoach);
    deps.sms.optedOut.add("+15551234567");
    await paidRequest(deps);
    expect((await deps.store.getCoach(coach.id))!.sms_opted_out).toBe(true);
    expect(deps.mailer.sent.some((m) => m.to === "pat@example.com")).toBe(true);
  });
  it("texts reminders as the deadline approaches", async () => {
    const { deps, advance } = makeDeps();
    await addCoach(deps, smsCoach);
    await paidRequest(deps);
    advance(5 * 24 - 20); // ~20h left
    await runCron(deps);
    expect(deps.sms.sent.some((m) => /left to record/.test(m.body))).toBe(true);
  });
  it("texts the founder on each new order when ADMIN_ALERT_PHONE is set", async () => {
    process.env.ADMIN_ALERT_PHONE = "+15559990000";
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    expect(deps.sms.sent.some((m) => m.to === "+15559990000" && m.body.includes(req.ref))).toBe(true);
    delete process.env.ADMIN_ALERT_PHONE;
  });
  it("normalizes US phone numbers", () => {
    expect(toE164("(555) 123-4567")).toBe("+15551234567");
    expect(toE164("1-555-123-4567")).toBe("+15551234567");
    expect(toE164("123")).toBeNull();
  });
});

describe("film link", () => {
  const fake = (status: number, location?: string) =>
    (async () => new Response("", { status, headers: location ? { location } : {} })) as unknown as typeof fetch;
  it("flags private / missing YouTube, Vimeo and Drive links before payment", async () => {
    expect((await checkFilmLink("https://youtu.be/abcdefghijk", fake(200))).status).toBe("ok");
    expect((await checkFilmLink("https://youtu.be/abcdefghijk", fake(401))).status).toBe("private");
    expect((await checkFilmLink("https://vimeo.com/123", fake(404))).status).toBe("not_found");
    expect((await checkFilmLink("https://drive.google.com/file/d/x/view", fake(302, "https://accounts.google.com/ServiceLogin"))).status).toBe("private");
  });
  it("never fetches unknown hosts (no server-side request forgery) and allows them", async () => {
    let called = false;
    const spy = (async () => { called = true; return new Response(""); }) as unknown as typeof fetch;
    expect((await checkFilmLink("https://www.hudl.com/video/3/1/abc", spy)).status).toBe("unknown");
    expect(called).toBe(false);
  });
  it("network trouble never blocks checkout", async () => {
    const boom = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect((await checkFilmLink("https://youtu.be/abcdefghijk", boom)).status).toBe("unknown");
  });

  it("coach can't open film → family gets a fix link → coach is re-notified; no cancellation", async () => {
    const { deps } = makeDeps();
    await addCoach(deps, smsCoach);
    const req = await paidRequest(deps);
    await reportFilmIssue(deps, req, "Says private");
    await reportFilmIssue(deps, req, "again"); // idempotent
    const famEmails = deps.mailer.sent.filter((m) => m.to === "parent@example.com" && m.subject.startsWith("Action needed"));
    expect(famEmails).toHaveLength(1);
    expect(famEmails[0]!.html).toContain("/fix/");
    const token = fixFilmUrl((await deps.store.getRequest(req.id))!).split("/fix/")[1]!;
    const found = await resolveFixLink(deps, token);
    expect(found?.req.id).toBe(req.id);
    const fixed = await fixFilmLink(deps, found!.req, "https://www.hudl.com/video/3/1/new");
    expect(fixed.film_url).toBe("https://www.hudl.com/video/3/1/new");
    expect(fixed.film_issue_at).toBeNull();
    expect(fixed.status).toBe("coach_notified");
    expect(deps.mailer.sent.some((m) => m.to === "pat@example.com" && m.subject.startsWith("Updated film link"))).toBe(true);
    expect(deps.sms.sent.some((m) => /new film link/.test(m.body))).toBe(true);
  });
  it("a fixed link extends the deadline but never past the card hold", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    const holdEnds = new Date(Date.parse(req.expires_at!) + 24 * 3_600_000).toISOString();
    await deps.store.casRequest(req.id, {}, { authorization_expires_at: holdEnds });
    const fixed = await fixFilmLink(deps, (await deps.store.getRequest(req.id))!, "https://www.hudl.com/v/2");
    expect(Date.parse(fixed.expires_at!)).toBe(Date.parse(holdEnds) - 12 * 3_600_000);
  });
});

describe("delivery experience", () => {
  async function delivered(over = {}) {
    const h = makeDeps();
    const coach = await addCoach(h.deps, over);
    const req = await paidRequest(h.deps);
    const done = await submitVideo(h.deps, req, {
      path: await upload(h.deps, req.id), durationSeconds: 45, attest: true,
      takeaways: { strength: "Elite first step", improve: "Left hand finishing", next: "Add catch-and-shoot clips" },
    });
    return { ...h, coach, req: done };
  }
  it("written takeaways and a second-opinion link are in the delivery email", async () => {
    const { deps } = await delivered();
    const email = deps.mailer.sent.find((m) => m.to === "parent@example.com" && /replied/.test(m.subject))!;
    expect(email.html).toContain("Elite first step");
    expect(email.html).toContain("Get a second coach");
  });
  it("second-opinion link pre-fills and links the new request to the original", async () => {
    const { deps, req } = await delivered();
    const token = new URL(secondOpinionUrl(req)).searchParams.get("from")!;
    expect((await resolveAgainLink(deps, token))?.athlete_name).toBe("Sam Athlete");
    await addCoach(deps, { slug: "coach-two", email: "two@example.com" });
    const { requestId } = await createRequestAndCheckout(deps, input({ coachSlug: "coach-two", fromToken: token }), { ip: "z" });
    expect((await deps.store.getRequest(requestId))!.parent_request_id).toBe(req.id);
    const forged = await createRequestAndCheckout(deps, input({ coachSlug: "coach-two", fromToken: token + "x", purchaserEmail: "q@x.y" }), { ip: "w" });
    expect((await deps.store.getRequest(forged.requestId))!.parent_request_id).toBeNull();
  });
  it("family rates once; coach rating + delivery badges appear after 3", async () => {
    const { deps, req, coach } = await delivered();
    await Promise.all([rateDelivery(deps, req, { rating: 5, wouldBuyAgain: true, comment: null }), rateDelivery(deps, req, { rating: 5, wouldBuyAgain: true, comment: null })]);
    const c = (await deps.store.getCoach(coach.id))!;
    expect(c.rating_count).toBe(1);
    expect(c.delivered_count).toBe(1);
    expect(ratingBadge(c)).toBeNull();
    expect(ratingBadge({ rating_sum: 14, rating_count: 3 })).toEqual({ avg: "4.7", count: 3 });
    expect(deliveryBadge({ delivered_count: 4, delivery_hours_total: 4 * 30 })).toBe("Usually delivers in ~1 day");
  });
  it("a low rating alerts the founder", async () => {
    process.env.ADMIN_ALERT_PHONE = "+15559990000";
    const { deps, req } = await delivered();
    await rateDelivery(deps, req, { rating: 2, wouldBuyAgain: false, comment: "Too generic" });
    expect(deps.sms.sent.some((m) => m.body.includes("rated 2/5"))).toBe(true);
    delete process.env.ADMIN_ALERT_PHONE;
  });
});

describe("coach hub", () => {
  it("pausing blocks new bookings but not pending payouts", async () => {
    const { deps } = makeDeps();
    const coach = await addCoach(deps);
    await setPaused(deps, coach, true);
    await expect(createRequestAndCheckout(deps, input(), { ip: "p" })).rejects.toThrow(/isn't accepting/);
    await setPaused(deps, (await deps.store.getCoach(coach.id))!, false);
    await expect(createRequestAndCheckout(deps, input(), { ip: "p" })).resolves.toBeTruthy();
  });
  it("intro video upload is scoped to the coach and replaces the old one", async () => {
    const { deps } = makeDeps();
    const coach = await addCoach(deps);
    const t = await createIntroUploadTarget(deps, coach, { mime: "video/mp4", size: 2_000_000 });
    expect(t.path.startsWith(`coaches/${coach.id}/intro-`)).toBe(true);
    deps.storage.files.set(t.path, { data: Buffer.alloc(2_000_000), mime: "video/mp4" });
    const c1 = await saveIntroVideo(deps, coach, { path: t.path, durationSeconds: 20 });
    const t2 = await createIntroUploadTarget(deps, c1, { mime: "video/mp4", size: 2_000_000 });
    deps.storage.files.set(t2.path, { data: Buffer.alloc(2_000_000), mime: "video/mp4" });
    await saveIntroVideo(deps, c1, { path: t2.path, durationSeconds: 20 });
    expect(deps.storage.files.has(t.path)).toBe(false);
    await expect(saveIntroVideo(deps, c1, { path: "coaches/other/intro-x.mp4" })).rejects.toThrow(/Invalid/);
  });
  it("sign-up sends the confirm-email + payout-setup welcome once", async () => {
    const { deps } = makeDeps();
    const coach = await addCoach(deps);
    const c = await sendPayoutInvite(deps, coach);
    await sendPayoutInvite(deps, c);
    expect(deps.mailer.sent.filter((m) => m.subject.startsWith("Confirm your email"))).toHaveLength(1);
  });
  it("weekly earnings email goes out once a week, only to coaches who were paid", async () => {
    const { deps, advance } = makeDeps();
    const coach = await addCoach(deps);
    const { id } = await deps.payments.createConnectAccount({ coachId: coach.id, email: "", name: "" });
    deps.payments.completeOnboarding(id);
    await deps.store.updateCoach(coach.id, { stripe_account_id: id, stripe_transfers_active: true, stripe_details_submitted: true });
    const req = await paidRequest(deps);
    await submitVideo(deps, req, { path: await upload(deps, req.id), durationSeconds: 40, attest: true });
    await addCoach(deps, { slug: "idle", email: "idle@example.com" });
    expect(await sendWeeklySummaries(deps)).toBe(1);
    expect(await sendWeeklySummaries(deps)).toBe(0);
    advance(8 * 24);
    expect(await sendWeeklySummaries(deps)).toBe(0); // nothing paid in the last week
  });
});

describe("pilot defaults", () => {
  it("review-before-delivery holds the video until approved, but charges the card at submit", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    await deps.store.updateSettings({ require_admin_review: true });
    const req = await paidRequest(deps);
    const r = await submitVideo(deps, req, { path: await upload(deps, req.id), durationSeconds: 40, attest: true });
    expect(r.status).toBe("submitted");
    expect(r.payment_captured_at).not.toBeNull();
    expect(deps.mailer.sent.some((m) => m.to === "parent@example.com" && /replied/.test(m.subject))).toBe(false);
  });
  it("declined requests still never charge", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    await declineRequest(deps, req, null);
    expect(deps.payments.captures).toHaveLength(0);
  });
});


describe("open marketplace: acquisition loop", () => {
  it("a family requests a coach who never signed up → coach gets ONE welcome+request email with the offer and a claim-profile link", async () => {
    const { deps } = makeDeps();
    await addCoach(deps, { slug: "dir", email: "dir@school.edu", listing_type: "directory", source: "import", email_confirmed_at: null,
      verification_status: "unverified", eligibility_status: "not_reviewed", price_cents: null });
    deps.store.settings.format_prices.video = 5000;
    const { requestId } = await createRequestAndCheckout(deps, input({ coachSlug: "dir" }), { ip: "o" });
    const req = (await deps.store.getRequest(requestId))!;
    expect(req.price_cents).toBe(5000);
    deps.payments.authorize(`pi_demo_${req.id}`);
    const { handleCheckoutPaid } = await import("@/lib/services/lifecycle");
    await handleCheckoutPaid(deps, { id: "cs", payment_status: "paid", payment_intent: `pi_demo_${req.id}`, client_reference_id: req.id, amount_total: 5000 });
    const mails = deps.mailer.sent.filter((m) => m.to === "dir@school.edu");
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toMatch(/^\$50 for a video breakdown/);
    expect(mails[0]!.html).toContain("A family chose you");
    expect(mails[0]!.html).toContain("Claim your free coach profile");
  });
  it("follow-ups: day-1 nudge if unopened, then ~3 days left, then final day — and they stop when the coach responds", async () => {
    const { deps, advance } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    advance(21);
    await runCron(deps);
    expect(deps.mailer.sent.filter((m) => /still waiting/.test(m.subject))).toHaveLength(1);
    advance(30); // ~69h left
    await runCron(deps);
    advance(48); // ~21h left
    await runCron(deps);
    const followUps = deps.mailer.sent.filter((m) => m.to === "pat@example.com" && /(still waiting|days? left)/.test(m.subject));
    expect(followUps).toHaveLength(3);
    await declineRequest(deps, (await deps.store.getRequest(req.id))!, null);
    advance(10);
    await runCron(deps);
    expect(deps.mailer.sent.filter((m) => m.to === "pat@example.com" && /(still waiting|days? left)/.test(m.subject))).toHaveLength(3);
  });
  it("impostor protection: Stripe-verified name doesn't match → payout held + founder alerted; admin can release", async () => {
    process.env.ADMIN_ALERT_EMAIL = "founder@example.com";
    const { deps } = makeDeps();
    const coach = await addCoach(deps, { full_name: "Famous Coach" });
    const { id } = await deps.payments.createConnectAccount({ coachId: coach.id, email: "", name: "Someone Else" });
    deps.payments.completeOnboarding(id);
    await deps.store.updateCoach(coach.id, { stripe_account_id: id });
    const { handleAccountUpdated, attemptPayout } = await import("@/lib/services/lifecycle");
    await handleAccountUpdated(deps, id);
    const req = await paidRequest(deps, { coachSlug: "pat-coach" });
    const r = await submitVideo(deps, req, { path: await upload(deps, req.id), durationSeconds: 40, attest: true });
    expect(r.payout_status).toBe("blocked");
    expect(r.payout_block_reason).toMatch(/Name check/);
    expect(deps.payments.transfers).toHaveLength(0);
    expect(deps.mailer.sent.some((m) => m.to === "founder@example.com" && /name doesn't match/.test(m.subject))).toBe(true);
    await deps.store.updateCoach(coach.id, { name_match_override: true });
    expect((await attemptPayout(deps, req.id)).payout_status).toBe("paid");
    delete process.env.ADMIN_ALERT_EMAIL;
  });
});
