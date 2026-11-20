import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addCoach, makeDeps } from "./helpers";
import { FreePayments } from "@/lib/integrations-free";
import { createAskOrder, handleAskSetupCompleted, submitAnswer, type AskInput } from "@/lib/services/line";
import { runCron } from "@/lib/services/cron";

const SCHOOL = "Example University";
function freeDeps() {
  const m = makeDeps();
  (m.deps as unknown as { payments: FreePayments }).payments = new FreePayments();
  return m;
}
const input: AskInput = {
  targets: [{ school: SCHOOL, sport: "Basketball (M)" }],
  message: "Hi Coach — Taylor is a 2027 PG. Any camps coming up this summer?",
  athleteName: "Taylor Brooks", gradYear: 2027, position: "PG", sport: "Basketball (M)", filmUrl: "https://youtu.be/abcdefghijk",
  purchaserName: "Morgan Brooks", purchaserEmail: "morgan@example.com", purchaserPhone: "(555) 222-3333", parentSmsConsent: true,
  athleteIsMinor: true, relationship: "parent_guardian",
};

describe("payments off (free Coach Line)", () => {
  beforeEach(() => { process.env.PAYMENTS_OFF = "1"; });
  afterEach(() => { process.env.PAYMENTS_OFF = "0"; });

  it("no card step, $0, no money promised; answer delivered; nothing to pay out", async () => {
    const { deps } = freeDeps();
    const rc = await addCoach(deps, { slug: "rc", full_name: "Rob Recruiter", title: "Recruiting Coordinator", school: SCHOOL, sport: "Basketball (M)", email: "rc@example.edu" });
    const { url, orderId } = await createAskOrder(deps, input, { ip: "1.1.1.1" });
    expect(url).toMatch(/\/ask\/sent\?order=/); // straight to "Sent" — no card page
    const order = (await deps.store.getOrder(orderId))!;
    expect(order.total_cents).toBe(0);
    await handleAskSetupCompleted(deps, order.stripe_checkout_session_id!); // a repeat is harmless
    const [req] = await deps.store.listRequests({ order_id: orderId });
    expect(req!.status).toBe("coach_notified");
    expect(req!.price_cents).toBe(0);
    const invite = deps.mailer.sent.find((m) => m.to === "rc@example.edu")!;
    expect(invite.subject).not.toMatch(/\$/);
    expect(invite.html).not.toContain("You earn");
    const receipt = deps.mailer.sent.find((m) => m.to === "morgan@example.com" && m.subject.startsWith("Sent!"))!;
    expect(receipt.html + receipt.text).not.toMatch(/charged|hold/i);
    expect(deps.sms.sent.every((s) => !/charged/.test(s.body))).toBe(true);

    const done = await submitAnswer(deps, req!, rc, { kind: "update", via: "link" });
    expect(done.status).toBe("completed");
    expect(done.payout_status).toBe("none");
    expect(deps.mailer.sent.some((m) => m.to === "morgan@example.com" && /answered/.test(m.subject))).toBe(true);
  });

  it("no answer: a friendly 'try another school' email, never a 'you weren't charged' one", async () => {
    const { deps, advance } = freeDeps();
    await addCoach(deps, { slug: "rc", full_name: "Rob Recruiter", title: "Recruiting Coordinator", school: SCHOOL, sport: "Basketball (M)", email: "rc@example.edu" });
    await createAskOrder(deps, input, { ip: "1.1.1.1" });
    advance(6 * 24);
    await runCron(deps);
    const m = deps.mailer.sent.find((x) => x.to === "morgan@example.com" && /No answer from/.test(x.subject))!;
    expect(m.html).toContain("/ask?from=");
    expect(deps.mailer.sent.some((x) => /charged|refund/i.test(x.subject))).toBe(false);
  });
});
