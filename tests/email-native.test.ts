import { describe, expect, it } from "vitest";
import { addCoach, makeDeps, paidRequest } from "./helpers";
import {
  handleInboundEmail, mailtoReply, parseCoachReply, replyAddress, resolveReplyAddress, stripQuoted, type InboundEmail,
} from "@/lib/services/email-native";
import { runCron } from "@/lib/services/cron";

const WRITTEN = `Level I see you at (D1 / D2 / D3 / NAIA / JUCO / Not yet): Strong D2, fringe D1
Top strength: Elite first step and he plays downhill every possession.
What to work on: Left hand finishing and shot prep off the catch.
Next step: Add 6 catch-and-shoot clips and a full game to the reel.

Coach P

On Tue, Nov 12, 2026 at 9:01 AM The Athlete Market <evaluations@theathletemarket.com> wrote:
> Coach Coach, a family wants your written take
> Athlete: Sam Athlete`;

function inbound(to: string, over: Partial<InboundEmail> = {}): InboundEmail {
  return { messageId: `m-${Math.random()}`, from: "pat@example.com", to: [to], subject: "Re: request", text: WRITTEN, attachments: [], ...over };
}

describe("reply parsing", () => {
  it("strips quoted history, signatures and mobile footers", () => {
    const t = stripQuoted("Great kid.\n\nSent from my iPhone\n\nOn Tue, Nov 12 at 9:01 AM X wrote:\n> old stuff");
    expect(t).toBe("Great kid.");
    expect(stripQuoted("Hi\n-- \nCoach Smith\n555-1234")).toBe("Hi");
    expect(stripQuoted("Answer\n\n-----Original Message-----\nFrom: x")).toBe("Answer");
  });
  it("pulls out the template fields", () => {
    const p = parseCoachReply(WRITTEN);
    expect(p.level).toBe("Strong D2, fringe D1");
    expect(p.strength).toMatch(/Elite first step/);
    expect(p.improve).toMatch(/Left hand/);
    expect(p.next).toMatch(/catch-and-shoot/);
    expect(p.body).not.toMatch(/wrote:/);
    expect(p.isDecline).toBe(false);
  });
  it("recognizes a PASS reply as a decline", () => {
    expect(parseCoachReply("Pass\n\nSent from my iPhone").isDecline).toBe(true);
    expect(parseCoachReply("No thanks.").isDecline).toBe(true);
    expect(parseCoachReply("No doubt he's a D2 guard with real upside and a great motor.").isDecline).toBe(false);
  });
});

describe("private reply addresses", () => {
  it("resolve only with a valid signature", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps);
    const addr = replyAddress(req);
    expect(addr).toMatch(/^r-[0-9a-f]{32}-[0-9a-f]{12}@reply\./);
    expect(addr.split("@")[0]!.length).toBeLessThanOrEqual(64);
    expect((await resolveReplyAddress(deps, [`"Coach" <${addr.toUpperCase()}>`]))?.id).toBe(req.id);
    expect(await resolveReplyAddress(deps, [addr.replace(/-([0-9a-f]{12})@/, "-000000000000@")])).toBeNull();
    expect(mailtoReply(req)).toContain(encodeURIComponent("Top strength: "));
  });
  it("the coach invite email has the private Reply-To and the template", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps, { format: "written" });
    const invite = deps.mailer.sent.find((m) => m.to === "pat@example.com")!;
    expect(invite.replyTo).toBe(replyAddress(req));
    expect(invite.html).toContain("Top strength:");
    expect(invite.html).toContain("hit Reply");
    expect(invite.subject).toMatch(/for a written take/);
  });
});

describe("inbound replies (coach replies from their own inbox)", () => {
  it("written reply → card charged → parent gets the reply text + level in their inbox → coach paid", async () => {
    const { deps } = makeDeps();
    const coach = await addCoach(deps);
    const { id } = await deps.payments.createConnectAccount({ coachId: coach.id, email: "", name: "Pat Coach" });
    deps.payments.completeOnboarding(id);
    await deps.store.updateCoach(coach.id, { stripe_account_id: id, stripe_transfers_active: true, stripe_details_submitted: true });
    const req = await paidRequest(deps, { format: "written" });
    expect(req.price_cents).toBe(2000);
    expect(await handleInboundEmail(deps, inbound(replyAddress(req)))).toBe("accepted");
    const r = (await deps.store.getRequest(req.id))!;
    expect(r.status).toBe("completed");
    expect(r.level_read).toBe("Strong D2, fringe D1");
    expect(r.response_text).toMatch(/Elite first step/);
    expect(r.response_text).not.toMatch(/wrote:/);
    expect(r.response_text).not.toMatch(/\(D1 \//); // template hint removed
    expect(r.response_text).not.toMatch(/^Level/m);  // level shown separately
    expect(deps.payments.captures).toEqual([req.stripe_payment_intent_id]);
    const toParent = deps.mailer.sent.find((m) => m.to === "parent@example.com" && /replied/.test(m.subject))!;
    expect(toParent.html).toContain("Strong D2, fringe D1");
    expect(toParent.html).toContain("Elite first step");
    expect(toParent.html).toContain("theathletemarket.com");
    expect(toParent.html).not.toContain("pat@example.com"); // the coach's email is never exposed to the family
    expect(r.payout_status).toBe("paid");
  });

  it("is idempotent: the same email delivered twice is processed once", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps, { format: "written" });
    const msg = inbound(replyAddress(req), { messageId: "same-id" });
    expect(await handleInboundEmail(deps, msg)).toBe("accepted");
    expect(await handleInboundEmail(deps, msg)).toBe("duplicate");
    expect(deps.payments.captures).toHaveLength(1);
  });

  it("a too-short written reply gets a friendly auto-reply and no charge", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps, { format: "written" });
    expect(await handleInboundEmail(deps, inbound(replyAddress(req), { text: "Looks good!" }))).toBe("too_short");
    expect(deps.payments.captures).toHaveLength(0);
    const auto = deps.mailer.sent.find((m) => m.subject.startsWith("Almost there"))!;
    expect(auto.to).toBe("pat@example.com");
    expect(auto.html).toContain("Top strength:");
  });

  it("voice request + voice memo attachment → stored and delivered as a voice note", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps, { format: "voice" });
    const memo = { name: "New Recording 12.m4a", contentType: "audio/x-m4a", contentBase64: Buffer.alloc(300_000, 1).toString("base64"), size: 300_000 };
    expect(await handleInboundEmail(deps, inbound(replyAddress(req), { text: "Here you go — listen to the memo.", attachments: [memo] }))).toBe("accepted");
    const r = (await deps.store.getRequest(req.id))!;
    expect(r.response_kind).toBe("voice");
    expect(r.video_path).toMatch(/reply-.*\.m4a$/);
    expect(deps.storage.files.get(r.video_path!)!.data.length).toBe(300_000);
    expect(deps.mailer.sent.find((m) => m.to === "parent@example.com" && /replied/.test(m.subject))!.html).toContain("Listen to the voice note");
  });

  it("voice request with no memo → asks for the memo; video request accepts a video link", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const voice = await paidRequest(deps, { format: "voice" });
    expect(await handleInboundEmail(deps, inbound(replyAddress(voice), { text: "Nice film." }))).toBe("needs_media");
    const video = await paidRequest(deps, { format: "video", purchaserEmail: "v@example.com" });
    expect(await handleInboundEmail(deps, inbound(replyAddress(video), { text: "My breakdown: https://youtu.be/abcdEFGhijk thanks" }))).toBe("accepted");
    expect((await deps.store.getRequest(video.id))!.response_link).toBe("https://youtu.be/abcdEFGhijk");
  });

  it("PASS declines and releases the hold; a late reply after expiry is refused", async () => {
    const { deps, advance } = makeDeps();
    await addCoach(deps);
    const a = await paidRequest(deps, { format: "written" });
    expect(await handleInboundEmail(deps, inbound(replyAddress(a), { text: "Pass" }))).toBe("declined");
    expect((await deps.store.getRequest(a.id))!.status).toBe("refunded");
    const b = await paidRequest(deps, { format: "written", purchaserEmail: "b@example.com" });
    advance(6 * 24);
    await runCron(deps);
    expect(await handleInboundEmail(deps, inbound(replyAddress(b)))).toBe("closed");
    expect(deps.payments.captures).toHaveLength(0);
  });

  it("parent gets status texts when they opt in", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    const req = await paidRequest(deps, { format: "written", purchaserPhone: "(555) 222-3333", parentSmsConsent: "on" });
    await handleInboundEmail(deps, inbound(replyAddress(req)));
    const texts = deps.sms.sent.filter((m) => m.to === "+15552223333").map((m) => m.body);
    expect(texts.some((t) => /went to/.test(t))).toBe(true);
    expect(texts.some((t) => /replied/.test(t))).toBe(true);
  });

  it("unknown addresses are ignored safely", async () => {
    const { deps } = makeDeps();
    expect(await handleInboundEmail(deps, inbound("someone@else.com"))).toBe("unknown_address");
  });
});
