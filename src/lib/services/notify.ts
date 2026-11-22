import type { Deps } from "../deps";
import { env } from "../env";
import { adminAlert, type Rendered } from "../email/templates";
import { SmsOptedOutError } from "../integrations";
import { log } from "../log";
import { unsubscribeUrl } from "./links";
import { inboundDomain } from "./email-native";

/**
 * Send one email and record it in email_log. Coach-facing emails honor the suppression list.
 * Never throws for "suppressed"; throws on provider failure so callers can decide to retry.
 */
export async function sendEmail(
  deps: Deps,
  a: {
    to: string;
    rendered: Rendered;
    template: string;
    idempotencyKey: string;
    requestId?: string | null;
    coachId?: string | null;
    marketing?: boolean; // coach invitations/reminders: suppression + List-Unsubscribe apply
    replyTo?: string;
  },
): Promise<"sent" | "suppressed"> {
  const base = {
    request_id: a.requestId ?? null,
    coach_id: a.coachId ?? null,
    to_email: a.to,
    template: a.template,
    subject: a.rendered.subject,
  };
  // Test mode: reroute every email to the owner's inbox, labeled with who it was really for.
  const testInbox = env.testInbox();
  if (testInbox && a.to.toLowerCase() !== testInbox) {
    a = { ...a, to: testInbox, rendered: { ...a.rendered, subject: `[TEST → ${a.to}] ${a.rendered.subject}` } };
  }
  // Until inbound email (Postmark) is set up, our private reply addresses can't receive mail. A Reply-To
  // on a domain with no mail server is a spam signal, so leave it off (replies go to EMAIL_REPLY_TO, if set).
  if (a.replyTo && !process.env.INBOUND_WEBHOOK_SECRET?.trim() && a.replyTo.toLowerCase().endsWith(`@${inboundDomain()}`)) {
    a = { ...a, replyTo: undefined };
  }
  if (a.marketing && (await deps.store.isSuppressed(a.to))) {
    await deps.store.logEmail({ ...base, provider_id: null, status: "suppressed", error: null });
    return "suppressed";
  }
  const headers: Record<string, string> = {};
  if (a.marketing) {
    const unsub = unsubscribeUrl(a.to);
    headers["List-Unsubscribe"] = `<${unsub.replace("/unsubscribe/", "/api/unsubscribe/")}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  try {
    const { id } = await deps.mailer.send({
      to: a.to,
      subject: a.rendered.subject,
      html: a.rendered.html,
      text: a.rendered.text,
      idempotencyKey: a.idempotencyKey,
      headers,
      replyTo: a.replyTo,
    });
    await deps.store.logEmail({ ...base, provider_id: id, status: "sent", error: null });
    return "sent";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await deps.store.logEmail({ ...base, provider_id: null, status: "failed", error: msg.slice(0, 500) });
    throw e;
  }
}

/** Ops alert: always logged; emailed when ADMIN_ALERT_EMAIL is configured. Never throws. */
export async function alertAdmin(deps: Deps, title: string, lines: string[], url?: string) {
  log("error", `[alert] ${title}`, { lines, url });
  const to = env.adminAlertEmail();
  if (!to) return;
  try {
    await sendEmail(deps, {
      to,
      rendered: adminAlert({ title, lines, url, postalAddress: env.postalAddress() }),
      template: "admin_alert",
      idempotencyKey: `alert-${title}-${lines.join("|")}`.slice(0, 200),
    });
  } catch (e) {
    log("error", "[alert] failed to email admin", { error: String(e) });
  }
}

/**
 * Send one text. Never sent twice for the same dedupeKey (claimed in the log before sending).
 * Never throws: SMS is a fast-lane on top of email, never the only channel.
 * Returns "opted_out" when the person replied STOP (caller should stop texting them).
 */
export async function sendSms(
  deps: Deps,
  a: { to: string | null; body: string; template: string; dedupeKey: string; requestId?: string | null; coachId?: string | null },
): Promise<"sent" | "skipped" | "opted_out" | "failed"> {
  if (env.testInbox() || env.testPhone()) {
    // Test mode: texts only ever go to the owner's phone.
    const tp = env.testPhone();
    if (!tp) return "skipped";
    if (a.to && a.to !== tp) a = { ...a, body: `[TEST → ${a.to}] ${a.body}`, to: tp };
  }
  if (!a.to || !deps.sms.enabled) return "skipped";
  const claimed = await deps.store
    .claimMessage({
      channel: "sms", dedupe_key: a.dedupeKey, request_id: a.requestId ?? null, coach_id: a.coachId ?? null,
      to_email: a.to, template: a.template, subject: a.body.slice(0, 120), provider_id: null, status: "failed", error: "pending",
    })
    .catch((e) => { log("error", "sms claim failed", { error: String(e) }); return false; });
  if (!claimed) return "skipped";
  try {
    const { id } = await deps.sms.send({ to: a.to, body: a.body });
    await deps.store.finishMessage(a.dedupeKey, { status: "sent", provider_id: id, error: null });
    return "sent";
  } catch (e) {
    const opted = e instanceof SmsOptedOutError;
    await deps.store.finishMessage(a.dedupeKey, { status: opted ? "suppressed" : "failed", error: String(e).slice(0, 300) }).catch(() => {});
    log(opted ? "info" : "warn", "sms not sent", { template: a.template, error: String(e) });
    return opted ? "opted_out" : "failed";
  }
}

/** Text the founder (ADMIN_ALERT_PHONE) — for hands-on handling of the first orders. */
export async function textAdmin(deps: Deps, body: string, dedupeKey: string) {
  await sendSms(deps, { to: env.adminAlertPhone() ?? null, body, template: "admin_sms", dedupeKey });
}
