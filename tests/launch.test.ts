import { afterEach, describe, expect, it } from "vitest";
import { makeDeps } from "./helpers";
import { sendEmail, sendSms } from "@/lib/services/notify";

const rendered = { subject: "Taylor asked about your program", html: "<p>hi</p>", text: "hi" };

describe("test mode (TEST_INBOX / TEST_PHONE)", () => {
  afterEach(() => { delete process.env.TEST_INBOX; delete process.env.TEST_PHONE; });

  it("reroutes every email to the owner, labeled with the real recipient", async () => {
    process.env.TEST_INBOX = "Owner@Example.com";
    const { deps } = makeDeps();
    await sendEmail(deps, { to: "real.coach@school.edu", rendered, template: "t", idempotencyKey: "k1" });
    await sendEmail(deps, { to: "owner@example.com", rendered, template: "t", idempotencyKey: "k2" });
    expect(deps.mailer.sent.map((m) => m.to)).toEqual(["owner@example.com", "owner@example.com"]);
    expect(deps.mailer.sent.map((m) => m.subject).sort()).toEqual(["Taylor asked about your program", "[TEST → real.coach@school.edu] Taylor asked about your program"]);
  });

  it("texts only go to the owner's phone; skipped entirely if no test phone", async () => {
    process.env.TEST_INBOX = "owner@example.com";
    const { deps } = makeDeps();
    expect(await sendSms(deps, { to: "+15550001111", body: "hi", template: "t", dedupeKey: "s1" })).toBe("skipped");
    process.env.TEST_PHONE = "+15559998888";
    await sendSms(deps, { to: "+15550001111", body: "hi", template: "t", dedupeKey: "s2" });
    expect(deps.sms.sent.map((s) => s.to)).toEqual(["+15559998888"]);
    expect(deps.sms.sent[0]!.body).toMatch(/^\[TEST → \+15550001111\]/);
  });
});
