import { describe, expect, it } from "vitest";
import { addCoach, makeDeps } from "./helpers";
import {
  askPricing, buildChain, createAskOrder, handleAskSetupCompleted, parentThreadAddress, resolveDraftToken,
  schoolLineAddress, staffRank, submitAnswer, handleParentSms, markAskOpened, passAsk, answerUrl, resolveAnswerLink, type AskInput,
} from "@/lib/services/line";
import { handleInboundEmail, replyAddress } from "@/lib/services/email-native";
import { runCron } from "@/lib/services/cron";
import { twilioSignature } from "@/lib/twilio-signature";

const SCHOOL = "Example University";
type D = ReturnType<typeof makeDeps>["deps"];

async function staff(deps: D) {
  const head = await addCoach(deps, { slug: "head", full_name: "Hank Head", title: "Head Coach", school: SCHOOL, sport: "Basketball (M)", email: "head@example.edu" });
  const asst = await addCoach(deps, { slug: "asst", full_name: "Amy Assistant", title: "Assistant Coach", school: SCHOOL, sport: "Basketball (M)", email: "asst@example.edu" });
  const rc = await addCoach(deps, { slug: "rc", full_name: "Rob Recruiter", title: "Recruiting Coordinator", school: SCHOOL, sport: "Basketball (M)", email: "rc@example.edu", phone: "+15550001111", sms_opt_in_at: "2026-11-01T00:00:00Z" });
  return { head, asst, rc };
}

const input = (over: Partial<AskInput> = {}): AskInput => ({
  targets: [{ school: SCHOOL, sport: "Basketball (M)" }],
  message: "Hi Coach — Taylor is a 2027 PG averaging 18 ppg. What's the best way to get on your radar this summer?",
  athleteName: "Taylor Brooks", gradYear: 2027, position: "PG", sport: "Basketball (M)", filmUrl: "https://youtu.be/abcdefghijk",
  purchaserName: "Morgan Brooks", purchaserEmail: "morgan@example.com", purchaserPhone: "(555) 222-3333", parentSmsConsent: true,
  athleteIsMinor: true, relationship: "parent_guardian", ...over,
});

async function place(deps: D, over: Partial<AskInput> = {}) {
  const { orderId } = await createAskOrder(deps, input(over), { ip: "1.1.1.1" });
  const order = (await deps.store.getOrder(orderId))!;
  deps.payments.setupSessions.get(order.stripe_checkout_session_id!)!.completed = true;
  await handleAskSetupCompleted(deps, order.stripe_checkout_session_id!);
  return deps.store.listRequests({ order_id: orderId });
}
const mails = (deps: D, to: string) => deps.mailer.sent.filter((m) => m.to === to);
const texts = (deps: D, to: string) => deps.sms.sent.filter((m) => m.to === to).map((m) => m.body);

describe("staff chain & pricing", () => {
  it("routes to the recruiting coordinator first, head coach last; a chosen coach goes first", async () => {
    const { deps } = makeDeps();
    const { head } = await staff(deps);
    expect((await buildChain(deps, { school: SCHOOL, sport: "Basketball (M)" })).map((c) => c.title)).toEqual(["Recruiting Coordinator", "Assistant Coach", "Head Coach"]);
    expect((await buildChain(deps, { coach: head })).map((c) => c.full_name)[0]).toBe("Hank Head");
    expect(staffRank("Graduate Assistant")).toBeLessThan(staffRank("Head Coach"));
  });
  it("pack pricing: 1 school $20, 3 for $49, 5 for $69 (split per school)", () => {
    const prices = { "1": 2000, "3": 4900, "5": 6900 };
    expect(askPricing(prices, 1)).toEqual({ total: 2000, each: [2000] });
    expect(askPricing(prices, 3).total).toBe(4900);
    expect(askPricing(prices, 3).each.reduce((a, b) => a + b)).toBe(4900);
    expect(askPricing(prices, 5).total).toBe(6900);
  });
});

describe("asking", () => {
  it("one checkout → card saved → one hold per school → first coach emailed (+ texted) with one-tap answers", async () => {
    const { deps } = makeDeps();
    await staff(deps);
    await addCoach(deps, { slug: "other", full_name: "Olivia Other", title: "Assistant Coach", school: "State College", sport: "Basketball (M)", email: "o@state.edu" });
    const reqs = await place(deps, { targets: [{ school: SCHOOL, sport: "Basketball (M)" }, { school: "State College", sport: "Basketball (M)" }] });
    expect(reqs).toHaveLength(2);
    expect(reqs.every((r) => r.status === "coach_notified")).toBe(true);
    expect(deps.payments.holdAmounts.size).toBe(2);
    const invite = mails(deps, "rc@example.edu")[0]!;
    expect(invite.subject).toBe("Question about Example University from Taylor Brooks (2027 PG)");
    expect(invite.subject).not.toMatch(/\$/); // no money in subjects (spam filters)
    expect(invite.html).toContain("$10");
    expect(invite.html).toContain("/a/");
    expect(invite.html).toContain("Invite to camp");
    expect(invite.replyTo).toMatch(/^r-/);
    expect(texts(deps, "+15550001111")[0]).toMatch(/Answer in one tap/);
    expect(mails(deps, "morgan@example.com").some((m) => m.subject.startsWith("Sent!"))).toBe(true);
    expect(texts(deps, "+15552223333")[0]).toMatch(/on its way to 2 schools/);
    expect(await deps.store.getSavedPayer("morgan@example.com")).not.toBeNull();
  });

  it("a one-tap camp answer: card charged, parent gets the camp card + text, coach earns 50%, camp saved for next time", async () => {
    const { deps } = makeDeps();
    const { rc } = await staff(deps);
    const { id } = await deps.payments.createConnectAccount({ coachId: rc.id, email: "", name: "Rob Recruiter" });
    deps.payments.completeOnboarding(id);
    await deps.store.updateCoach(rc.id, { stripe_account_id: id, stripe_transfers_active: true, stripe_details_submitted: true });
    const [req] = await place(deps);
    const camp = { name: "Elite Guard Camp", dates: "June 14–15", location: "Example Arena", url: "https://example.edu/camp" };
    const r = await submitAnswer(deps, req!, (await deps.store.getCoach(rc.id))!, { kind: "camp", camp, note: "Loved the pace.", save: true, via: "link" });
    expect(r.status).toBe("completed");
    expect(deps.payments.captures).toEqual([req!.stripe_payment_intent_id]);
    const ans = mails(deps, "morgan@example.com").find((m) => /answered/.test(m.subject))!;
    expect(ans.html).toContain("Elite Guard Camp");
    expect(ans.html).toContain("Register for Elite Guard Camp");
    // A personal note, not a form letter: greets the parent, names the athlete, gives next steps, signs off.
    expect(ans.html).toContain("Hi Morgan,");
    expect(ans.html).toContain("a 2027 PG up close");
    expect(ans.html).toContain("Your next steps");
    expect(ans.html).toContain("— Coach Recruiter");
    expect(ans.text).toMatch(/YOUR NEXT STEPS\n1\. Register for Elite Guard Camp/);
    expect(ans.replyTo).toMatch(/^p-/);
    expect(ans.html).not.toContain("rc@example.edu");
    expect(texts(deps, "+15552223333").some((t) => /answered! Camp invite: Elite Guard Camp/.test(t))).toBe(true);
    expect(deps.payments.transfers[0]!.amountCents).toBe(1500); // $10 + $5 fast-answer bonus (answered right away)
    expect((await deps.store.getCoach(rc.id))!.camps[0]!.name).toBe("Elite Guard Camp");
  });

  it("escalates through the staff when nobody answers; any coach on the chain can answer by email keyword", async () => {
    const { deps, advance } = makeDeps();
    const { asst } = await staff(deps);
    const [req] = await place(deps);
    expect(req!.coach_id).not.toBe(asst.id);
    advance(49);
    await runCron(deps);
    const r1 = (await deps.store.getRequest(req!.id))!;
    expect(r1.coach_id).toBe(asst.id);
    expect(mails(deps, "asst@example.edu").length).toBe(1);
    expect(texts(deps, "+15552223333").some((t) => /also sent your message to Amy Assistant/.test(t))).toBe(true);
    const out = await handleInboundEmail(deps, { messageId: "k1", from: "asst@example.edu", to: [replyAddress(r1)], subject: "Re", text: "LEVEL D2 — tough guard, needs to add strength.", attachments: [] });
    expect(out).toBe("accepted");
    const done = (await deps.store.getRequest(req!.id))!;
    expect(done.status).toBe("completed");
    expect(done.level_read).toBe("D2");
    expect(done.coach_id).toBe(asst.id);
  });

  it("first answer wins — a second coach answering gets a polite 'already answered' and nothing double-charges", async () => {
    const { deps } = makeDeps();
    const { rc, asst } = await staff(deps);
    const [req] = await place(deps);
    const results = await Promise.allSettled([
      submitAnswer(deps, req!, rc, { kind: "update", via: "link" }),
      submitAnswer(deps, req!, asst, { kind: "film", via: "link" }),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((results.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/already answered/);
    expect(deps.payments.captures).toHaveLength(1);
  });

  it("PASS moves it to the next coach; nobody answering → hold released, parent offered another school", async () => {
    const { deps, advance } = makeDeps();
    await staff(deps);
    const [req] = await place(deps);
    expect(await handleInboundEmail(deps, { messageId: "p1", from: "rc@example.edu", to: [replyAddress(req!)], subject: "Re", text: "Pass", attachments: [] })).toBe("passed_on");
    expect((await deps.store.getRequest(req!.id))!.escalation_index).toBe(1);
    advance(5 * 24 + 1);
    await runCron(deps);
    const r = (await deps.store.getRequest(req!.id))!;
    expect(r.status).toBe("refunded");
    expect(deps.payments.captures).toHaveLength(0);
    const rel = mails(deps, "morgan@example.com").find((m) => m.subject.startsWith("You weren't charged"))!;
    expect(rel.html).toContain("No one on the Example University staff answered in time");
    expect(rel.html).toContain("/ask?from="); // "ask another school", not the film-evaluation page
    expect(texts(deps, "+15552223333").some((t) => /NOT charged\. Ask another school.*\/ask\?from=/.test(t))).toBe(true);
  });
});

describe("the line stays open (two-way relay, email + SMS)", () => {
  it("parent replies by email → coach; coach replies → parent; parent texts → coach. Addresses never exposed.", async () => {
    const { deps } = makeDeps();
    const { rc } = await staff(deps);
    const [req] = await place(deps);
    await submitAnswer(deps, req!, rc, { kind: "film", via: "link" });
    const r = (await deps.store.getRequest(req!.id))!;
    expect(await handleInboundEmail(deps, { messageId: "t1", from: "morgan@example.com", to: [parentThreadAddress(r)], subject: "Re", text: "Here's a full game: https://youtu.be/zzzzzzzzzzz\n\nOn Tue X wrote:\n> old", attachments: [] })).toBe("relayed");
    const toCoach = mails(deps, "rc@example.edu").find((m) => /new message from the family/.test(m.subject))!;
    expect(toCoach.html).toContain("full game");
    expect(toCoach.html).not.toContain("morgan@example.com");
    expect(await handleInboundEmail(deps, { messageId: "t2", from: "rc@example.edu", to: [replyAddress(r)], subject: "Re", text: "Thanks — we'll watch it this week.", attachments: [] })).toBe("relayed");
    expect(mails(deps, "morgan@example.com").some((m) => /new message from Rob Recruiter/.test(m.subject))).toBe(true);
    expect(await handleParentSms(deps, "(555) 222-3333", "Thank you Coach!")).toBe("relayed");
    expect((await deps.store.listThread(r.id)).map((t) => t.direction)).toEqual(["parent_to_coach", "coach_to_parent", "parent_to_coach"]);
  });
  it("forged thread addresses are ignored", async () => {
    const { deps } = makeDeps();
    expect(await handleInboundEmail(deps, { messageId: "f", from: "x@y.z", to: ["p-00000000000000000000000000000000-000000000000@reply.theathletemarket.com"], subject: "", text: "hi", attachments: [] })).toBe("unknown_address");
  });
});

describe("Gmail railway — parents email a school's Coach Line address from their own inbox", () => {
  it("first time: auto-reply with a one-tap confirm link", async () => {
    const { deps } = makeDeps();
    await staff(deps);
    const addr = schoolLineAddress(SCHOOL, "Basketball (M)");
    expect(addr).toBe("example-university--basketball-m@reply.theathletemarket.com");
    const out = await handleInboundEmail(deps, { messageId: "g1", from: "newmom@gmail.com", to: [addr], subject: "My son", text: "Hi coach, my son Jay is a 2028 SG. Film: https://youtu.be/abcdefghijk — what camps do you recommend?", attachments: [] });
    expect(out).toBe("awaiting_confirm");
    const reply = mails(deps, "newmom@gmail.com")[0]!;
    expect(reply.subject).toMatch(/Confirm: your message to Example University/);
    const token = reply.html.match(/\/ask\/confirm\/([^"]+)"/)![1]!;
    const draft = await resolveDraftToken(deps, decodeURIComponent(token));
    expect(draft?.message).toContain("what camps");
    expect(draft?.film_url).toBe("https://youtu.be/abcdefghijk");
  });

  it("returning parent: just reply YES — held on the saved card and sent, 100% from Gmail", async () => {
    const { deps } = makeDeps();
    await staff(deps);
    await place(deps); // first order saves the card
    const before = deps.payments.holdAmounts.size;
    const addr = schoolLineAddress(SCHOOL, "Basketball (M)");
    expect(await handleInboundEmail(deps, { messageId: "g2", from: "morgan@example.com", to: [addr], subject: "Follow up", text: "Coach — Taylor just dropped 30. New film: https://youtu.be/bbbbbbbbbbb", attachments: [] })).toBe("awaiting_yes");
    const yesMail = mails(deps, "morgan@example.com").find((m) => m.subject.startsWith("Reply YES"))!;
    expect(yesMail.replyTo).toMatch(/^d-/);
    expect(await handleInboundEmail(deps, { messageId: "g3", from: "morgan@example.com", to: [yesMail.replyTo!], subject: "Re", text: "Yes", attachments: [] })).toBe("sent");
    expect(deps.payments.holdAmounts.size).toBe(before + 1);
    expect(mails(deps, "rc@example.edu").length).toBeGreaterThanOrEqual(1);
  });
});

describe("coach share setting", () => {
  it("0% share: coach is not paid, nothing transferred, platform keeps the full price", async () => {
    const { deps } = makeDeps();
    deps.store.settings.ask_coach_share_bps = 0;
    const { rc } = await staff(deps);
    const [req] = await place(deps);
    expect(req!.coach_payout_cents).toBe(0);
    const r = await submitAnswer(deps, req!, rc, { kind: "update", via: "link" });
    expect(r.payout_status).toBe("none");
    expect(deps.payments.transfers).toHaveLength(0);
  });
});

describe("coach answer page actions", () => {
  it("opening the page texts the parent once; pass-on hands it to the next coach; answer link scoped to the chain", async () => {
    const { deps } = makeDeps();
    const { rc, asst } = await staff(deps);
    const [r] = await place(deps);
    await markAskOpened(deps, r!, rc);
    await markAskOpened(deps, (await deps.store.getRequest(r!.id))!, rc);
    expect(texts(deps, "+15552223333").filter((t) => /just opened your message/.test(t))).toHaveLength(1);

    const link = answerUrl(r!, rc).split("/a/")[1]!;
    expect((await resolveAnswerLink(deps, link))?.coach.id).toBe(rc.id);
    expect(await resolveAnswerLink(deps, link.slice(0, -2) + "zz")).toBeNull();

    expect(await passAsk(deps, (await deps.store.getRequest(r!.id))!, rc)).toBe("passed_on");
    const after = (await deps.store.getRequest(r!.id))!;
    expect(after.escalation_index).toBe(1);
    expect(mails(deps, "asst@example.edu").length).toBeGreaterThan(0);
    const done = await submitAnswer(deps, after, asst, { kind: "level", level: "D2", note: "Good feet.", via: "link" });
    expect(done.status).toBe("completed");
    expect(done.coach_id).toBe(asst.id);
  });

  it("twilio signature matches Twilio's documented algorithm", () => {
    // Example from Twilio's security docs.
    const sig = twilioSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", {
      CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212",
    });
    expect(sig).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
  });
});

describe("any coach, by email (no directory)", () => {
  it("a privately added coach (no school, no sport) can be messaged, and is never suggested to other families", async () => {
    const { deps } = makeDeps();
    await deps.store.insertCoach({ slug: "jordan-smith", full_name: "Jordan Smith", email: "jsmith@stateu.example.edu", sport: "Other", school: null,
      listing_type: "directory", source: "family", unlisted: true, coach_kind: "active_college" });
    const { orderId } = await createAskOrder(deps, input({ targets: [{ coachSlug: "jordan-smith" }] }), { ip: "1.1.1.1" });
    const order = (await deps.store.getOrder(orderId))!;
    deps.payments.setupSessions.get(order.stripe_checkout_session_id!)!.completed = true;
    await handleAskSetupCompleted(deps, order.stripe_checkout_session_id!);
    const [r] = await deps.store.listRequests({ order_id: orderId });
    expect(r!.status).toBe("coach_notified");
    expect(r!.sport).toBe("Basketball (M)");
    expect(r!.target_school).toBe("Jordan Smith");
    expect(mails(deps, "jsmith@stateu.example.edu")[0]!.subject).toBe("Question from Taylor Brooks (2027 PG)");
    expect((await deps.store.getCoachBySlug("jordan-smith"))!.sport).toBe("Basketball (M)");
    expect(await deps.store.suggestSchools("jordan", 10)).toEqual([]);
    expect((await deps.store.searchCoaches({ q: "Jordan", limit: 10 })).coaches).toEqual([]);
  });
});

describe("inbox placement", () => {
  it("no private Reply-To until inbound email is set up (a Reply-To that can't receive mail looks like spam)", async () => {
    const saved = process.env.INBOUND_WEBHOOK_SECRET;
    delete process.env.INBOUND_WEBHOOK_SECRET;
    try {
      const { deps } = makeDeps();
      await staff(deps);
      await place(deps);
      expect(mails(deps, "rc@example.edu")[0]!.replyTo).toBeUndefined();
    } finally { process.env.INBOUND_WEBHOOK_SECRET = saved; }
  });
});

describe("fast-answer bonus", () => {
  it("answer within 24h: coach earns $15 (bonus from the platform's share); after 24h: $10", async () => {
    const { deps, advance } = makeDeps();
    const { rc } = await staff(deps);
    const [fast] = await place(deps);
    const invite = mails(deps, "rc@example.edu")[0]!;
    expect(invite.html).toContain("Answer in the next 24 hours: earn $15");
    expect(invite.subject).not.toMatch(/\$/);
    const a = await submitAnswer(deps, (await deps.store.getRequest(fast!.id))!, rc, { kind: "update", via: "link" });
    expect(a.coach_payout_cents).toBe(1500);
    expect(a.platform_fee_cents).toBe(500);
    expect(a.price_cents).toBe(2000);

    const [slow] = await place(deps, { purchaserEmail: "other@example.com", targets: [{ school: SCHOOL, sport: "Basketball (M)" }] });
    advance(25);
    const b = await submitAnswer(deps, (await deps.store.getRequest(slow!.id))!, rc, { kind: "update", via: "link" });
    expect(b.coach_payout_cents).toBe(1000);
    expect(b.platform_fee_cents).toBe(1000);
  });

  it("bonus 0 turns it off", async () => {
    const { deps } = makeDeps();
    deps.store.settings.fast_bonus_cents = 0;
    const { rc } = await staff(deps);
    const [r] = await place(deps);
    expect(mails(deps, "rc@example.edu")[0]!.html).toContain("You get paid $10 for answering");
    expect((await submitAnswer(deps, (await deps.store.getRequest(r!.id))!, rc, { kind: "update", via: "link" })).coach_payout_cents).toBe(1000);
  });
});
