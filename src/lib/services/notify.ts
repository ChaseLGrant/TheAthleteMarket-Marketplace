import type { Deps } from "../deps";
import { env } from "../env";
import { adminAlert, type Rendered } from "../email/templates";
import { log } from "../log";
import { unsubscribeUrl } from "./links";

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
  },
): Promise<"sent" | "suppressed"> {
  const base = {
    request_id: a.requestId ?? null,
    coach_id: a.coachId ?? null,
    to_email: a.to,
    template: a.template,
    subject: a.rendered.subject,
  };
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
