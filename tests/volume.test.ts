import { createHmac } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { addCoach, input, makeDeps, paidRequest } from "./helpers";
import { runCron } from "@/lib/services/cron";
import { handleUndeliverable, verifySvix } from "@/lib/services/deliverability";
import { resolveAgainLink } from "@/lib/services/access";
import { createRequestAndCheckout } from "@/lib/services/lifecycle";

const coachMails = (d: ReturnType<typeof makeDeps>["deps"]) => d.mailer.sent.filter((m) => m.to === "pat@example.com");

describe("high volume: one email per coach", () => {
  it("a second request while the first is unopened is batched — no extra email", async () => {
    const { deps } = makeDeps();
    await addCoach(deps);
    await paidRequest(deps);
    const second = await paidRequest(deps, { purchaserEmail: "b@example.com", athleteName: "Second Kid" });
    expect(second.status).toBe("coach_notified");
    expect(coachMails(deps)).toHaveLength(1);
  });

  it("follow-ups are combined: 3 families waiting → ONE email listing all of them (+ total)", async () => {
    const { deps, advance } = makeDeps();
    await addCoach(deps);
    await paidRequest(deps);
    await paidRequest(deps, { purchaserEmail: "b@example.com", athleteName: "Second Kid" });
    await paidRequest(deps, { purchaserEmail: "c@example.com", athleteName: "Third Kid" });
    advance(21);
    await runCron(deps);
    const digests = coachMails(deps).filter((m) => /families are waiting/.test(m.subject));
    expect(digests).toHaveLength(1);
    expect(digests[0]!.subject).toContain("$120");
    expect(digests[0]!.html).toContain("Second Kid");
    expect(digests[0]!.html).toContain("Third Kid");
    await runCron(deps);
    expect(coachMails(deps).filter((m) => /families are waiting/.test(m.subject))).toHaveLength(1); // not re-sent
  });

  it("cron is time-boxed and reports partial runs", async () => {
    const { deps, advance } = makeDeps();
    await addCoach(deps);
    await paidRequest(deps);
    advance(21);
    const out = await runCron(deps, { budgetMs: -1 });
    expect(out.partial).toBe(true);
  });
});

describe("deliverability", () => {
  it("a bounced coach address: suppressed, coach marked unreachable, waiting families released + offered another coach", async () => {
    const { deps } = makeDeps();
    const coach = await addCoach(deps);
    const req = await paidRequest(deps);
    await handleUndeliverable(deps, "pat@example.com", "bounced");
    expect(await deps.store.isSuppressed("pat@example.com")).toBe(true);
    expect((await deps.store.getCoach(coach.id))!.email_status).toBe("bounced");
    const after = (await deps.store.getRequest(req.id))!;
    expect(after.status).toBe("refunded");
    expect(deps.payments.captures).toHaveLength(0);
    const fam = deps.mailer.sent.find((m) => m.to === "parent@example.com" && m.subject.startsWith("You weren't charged"))!;
    expect(fam.html).toContain("Request another coach");
    const token = decodeURIComponent(fam.html.match(/from=([^"&]+)/)![1]!);
    expect((await resolveAgainLink(deps, token))?.athlete_name).toBe("Sam Athlete");
    await expect(createRequestAndCheckout(deps, input(), { ip: "x" })).rejects.toThrow();
  });

  it("verifies Resend/Svix webhook signatures and rejects stale or forged ones", () => {
    const secret = "whsec_" + Buffer.from("supersecretkey123").toString("base64");
    const body = '{"type":"email.bounced"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", Buffer.from("supersecretkey123")).update(`msg_1.${ts}.${body}`).digest("base64");
    expect(verifySvix(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body)).toBe(true);
    expect(verifySvix(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body + " ")).toBe(false);
    expect(verifySvix(secret, { id: "msg_1", timestamp: String(Number(ts) - 3600), signature: `v1,${sig}` }, body)).toBe(false);
  });
});

describe("Resend client under load", () => {
  // Load the live client once up front: a cold import on a busy machine can outlast the default 5s test timeout.
  beforeAll(async () => { await import("@/lib/integrations-live"); }, 30_000);
  afterEach(() => vi.unstubAllGlobals());
  it("retries when rate-limited (429) and succeeds", async () => {
    process.env.RESEND_API_KEY = "re_test";
    let calls = 0;
    // Count only Resend calls: stray background fetches from earlier tests must not skew the count.
    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
      if (!String(url).includes("api.resend.com")) return new Response("{}", { status: 200 });
      calls++;
      return calls < 3
        ? new Response(JSON.stringify({ message: "rate limited" }), { status: 429, headers: { "retry-after": "0" } })
        : new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
    }));
    const { ResendMailer } = await import("@/lib/integrations-live");
    const r = await new ResendMailer().send({ to: "a@b.co", subject: "s", html: "h", text: "t", idempotencyKey: "k" });
    expect(r.id).toBe("em_1");
    expect(calls).toBe(3);
  }, 20_000);
  it("does not retry permanent errors (e.g. invalid address)", async () => {
    process.env.RESEND_API_KEY = "re_test";
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
      if (!String(url).includes("api.resend.com")) return new Response("{}", { status: 200 });
      calls++;
      return new Response(JSON.stringify({ message: "invalid to" }), { status: 422 });
    }));
    const { ResendMailer } = await import("@/lib/integrations-live");
    await expect(new ResendMailer().send({ to: "bad", subject: "s", html: "h", text: "t" })).rejects.toThrow(/422/);
    expect(calls).toBe(1);
  }, 20_000);
});
