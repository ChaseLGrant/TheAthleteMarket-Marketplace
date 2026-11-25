import { describe, expect, it } from "vitest";
import { Microsoft365Mailer, RoutingMailer } from "@/lib/integrations-live";
import type { EmailMessage, Mailer } from "@/lib/integrations";

const cfg = { tenant: "t", clientId: "c", secret: "s", sender: "chase@theathletemarket.com" };
const msg: EmailMessage = { to: "coach@school.edu", subject: "Question about State U", html: "<p>hi</p>", text: "hi", replyTo: "chase@theathletemarket.com", audience: "coach" };

function fakeFetch(sendStatuses: number[]) {
  const calls: { url: string; body: string }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body) });
    if (url.includes("login.microsoftonline.com")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    const st = sendStatuses.shift() ?? 202;
    return new Response(st === 202 ? null : JSON.stringify({ error: { message: "nope" } }), { status: st, headers: { "retry-after": "0" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("Microsoft 365 sender (coach emails)", () => {
  it("signs in once and sends from the real mailbox via Graph", async () => {
    const { f, calls } = fakeFetch([202, 202]);
    const m = new Microsoft365Mailer(cfg, f);
    await m.send(msg); await m.send(msg);
    expect(calls.filter((c) => c.url.includes("login")).length).toBe(1);
    const send = calls.find((c) => c.url.includes("/users/chase%40theathletemarket.com/sendMail"))!;
    const body = JSON.parse(send.body);
    expect(body.message.toRecipients[0].emailAddress.address).toBe("coach@school.edu");
    expect(body.message.replyTo[0].emailAddress.address).toBe("chase@theathletemarket.com");
  });
  it("retries when Microsoft throttles", async () => {
    const { f, calls } = fakeFetch([429, 202]);
    await new Microsoft365Mailer(cfg, f).send(msg);
    expect(calls.filter((c) => c.url.includes("sendMail")).length).toBe(2);
  });
  it("routes coach email to Microsoft, family email to Resend, and falls back to Resend if Microsoft fails", async () => {
    const sent: string[] = [];
    const ms: Mailer = { send: async () => { sent.push("m365"); return { id: "1" }; } };
    const broken: Mailer = { send: async () => { throw new Error("down"); } };
    const resend: Mailer = { send: async () => { sent.push("resend"); return { id: "2" }; } };
    await new RoutingMailer(ms, resend).send(msg);
    await new RoutingMailer(ms, resend).send({ ...msg, audience: "family" });
    let fell = false;
    await new RoutingMailer(broken, resend, () => { fell = true; }).send(msg);
    expect(sent).toEqual(["m365", "resend", "resend"]);
    expect(fell).toBe(true);
  });
});

import { makeDeps, addCoach } from "./helpers";
import { sendEmail } from "@/lib/services/notify";
describe("coach routing in sendEmail", () => {
  it("marks any email to a coach's address as a coach email, even without coachId", async () => {
    const { deps } = makeDeps();
    await addCoach(deps, { email: "pat@school.edu" });
    const seen: string[] = [];
    const orig = deps.mailer.send.bind(deps.mailer);
    deps.mailer.send = async (m) => { seen.push(m.audience ?? ""); return orig(m); };
    await sendEmail(deps, { to: "pat@school.edu", rendered: { subject: "s", html: "h", text: "t" }, template: "x", idempotencyKey: "k1" });
    await sendEmail(deps, { to: "parent@gmail.com", rendered: { subject: "s", html: "h", text: "t" }, template: "x", idempotencyKey: "k2" });
    expect(seen).toEqual(["coach", "family"]);
  });
});
