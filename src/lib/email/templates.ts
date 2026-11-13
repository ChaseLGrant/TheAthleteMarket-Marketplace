import { money, dateOnly } from "../format";
import type { Coach, EvalRequest } from "../types";

/** Escape any user-supplied value before it goes into HTML. */
export function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const NAVY = "#0B1B3F";
const BLUE = "#1F5FFF";
const MUTED = "#5B6680";

interface LayoutOpts {
  preheader: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  secondary?: { label: string; url: string };
  footerHtml?: string;
  postalAddress: string;
}

function layout(o: LayoutOpts): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:#F4F6FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${NAVY};">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E3E8F2;">
<tr><td style="padding:22px 28px;background:${NAVY};color:#fff;font-weight:700;font-size:15px;letter-spacing:.2px;">The Athlete Market <span style="color:#8FB0FF;font-weight:500;">· Evaluations</span></td></tr>
<tr><td style="padding:28px 28px 8px;">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:${NAVY};">${esc(o.heading)}</h1>
${o.bodyHtml}
${o.cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;"><tr><td style="border-radius:12px;background:${BLUE};"><a href="${esc(o.cta.url)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">${esc(o.cta.label)}</a></td></tr></table>` : ""}
${o.secondary ? `<p style="margin:10px 0 0;font-size:14px;"><a href="${esc(o.secondary.url)}" style="color:${MUTED};">${esc(o.secondary.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:20px 28px 26px;font-size:12px;line-height:1.6;color:${MUTED};border-top:1px solid #EEF1F7;">
${o.footerHtml ?? ""}
<p style="margin:8px 0 0;">${esc(o.postalAddress)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

function row(label: string, value: string) {
  return `<tr><td style="padding:7px 0;color:${MUTED};font-size:14px;width:42%;vertical-align:top;">${esc(label)}</td><td style="padding:7px 0;font-size:14px;font-weight:600;color:${NAVY};">${value}</td></tr>`;
}
function table(rows: string[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;border-top:1px solid #EEF1F7;border-bottom:1px solid #EEF1F7;">${rows.join("")}</table>`;
}
const p = (html: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${NAVY};">${html}</p>`;

export type RefundWhy = "declined" | "expired" | "unavailable" | "admin";

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

const NO_PROMISE =
  "This is a paid feedback request only. You are not being asked to recruit, contact, offer, or promise anything to this athlete.";

export function coachInvite(a: {
  req: EvalRequest; coach: Coach; reviewUrl: string; declineUrl: string; unsubscribeUrl: string;
  postalAddress: string; reminder?: { daysLeft: number };
}): Rendered {
  const { req, coach } = a;
  const pay = money(req.coach_payout_cents);
  const deadline = dateOnly(req.expires_at);
  const subject = a.reminder
    ? `Reminder: ${req.athlete_name}'s evaluation (${pay}) — ${a.reminder.daysLeft} day${a.reminder.daysLeft === 1 ? "" : "s"} left`
    : `New paid evaluation request: ${req.athlete_name} · ${req.position} · ${pay}`;
  const html = layout({
    preheader: `${req.athlete_name} (${req.grad_year} ${req.position}) asked for a 30–60s video evaluation. You earn ${pay}.`,
    heading: a.reminder ? `${a.reminder.daysLeft} day${a.reminder.daysLeft === 1 ? "" : "s"} left to record` : `Coach ${coach.full_name.split(" ").slice(-1)[0]}, you have a paid evaluation request`,
    bodyHtml:
      p(`A family has asked for your honest feedback on their highlight film. Record a <strong>30–60 second video</strong> right from your phone's browser — no account, no app, no password.`) +
      table([
        row("Athlete", esc(req.athlete_name)),
        row("Sport · Position", `${esc(req.sport)} · ${esc(req.position)}`),
        row("Class of", esc(req.grad_year)),
        row("Highlight film", `<a href="${esc(req.film_url)}" style="color:${BLUE};">Watch film ↗</a>`),
        row("You receive", `<span style="color:#0A7A3E;">${pay}</span>`),
        row("Respond by", esc(deadline)),
      ]) +
      p(`<span style="font-size:13px;color:${MUTED};">${esc(NO_PROMISE)} Payment is sent to your bank via Stripe after you submit and finish a short one-time payout setup. If you decline or don't respond by the deadline, the family is simply never charged.</span>`),
    cta: { label: "Review & Record", url: a.reviewUrl },
    secondary: { label: "Decline this request", url: a.declineUrl },
    footerHtml: `You received this because a family requested an evaluation from you on The Athlete Market. Participation is entirely optional. <a href="${esc(a.unsubscribeUrl)}" style="color:${MUTED};">Never email me again</a>.`,
    postalAddress: a.postalAddress,
  });
  const text = [
    a.reminder ? `${a.reminder.daysLeft} day(s) left to record.` : `You have a paid evaluation request.`,
    ``,
    `Athlete: ${req.athlete_name}`,
    `Sport/Position: ${req.sport} / ${req.position}`,
    `Class of: ${req.grad_year}`,
    `Film: ${req.film_url}`,
    `You receive: ${pay}`,
    `Respond by: ${deadline}`,
    ``,
    `Review & Record: ${a.reviewUrl}`,
    `Decline: ${a.declineUrl}`,
    ``,
    NO_PROMISE,
    `Stop all emails: ${a.unsubscribeUrl}`,
    a.postalAddress,
  ].join("\n");
  return { subject, html, text };
}

export function purchaserReceipt(a: { req: EvalRequest; coach: Coach; postalAddress: string }): Rendered {
  const { req, coach } = a;
  const subject = `Request sent to ${coach.full_name} (${req.ref})`;
  const html = layout({
    preheader: `We've emailed ${coach.full_name}. You're only charged when your video is delivered.`,
    heading: "Your request is on its way",
    bodyHtml:
      p(`We've emailed <strong>${esc(coach.full_name)}</strong> your request for a 30–60 second video evaluation of ${esc(req.athlete_name)}.`) +
      table([
        row("Reference", esc(req.ref)),
        row("Card hold", `${money(req.price_cents)} <span style="font-weight:400;color:${MUTED};">(charged only on delivery)</span>`),
        row("Video by", esc(dateOnly(req.expires_at))),
      ]) +
      p(`<strong>What happens next:</strong> when the coach records, we'll email you a private link to watch it. Your card is <strong>only charged when the video is delivered</strong>. If they decline or don't respond by the deadline, the hold is released and you're never charged — nothing to do.`) +
      p(`<span style="font-size:13px;color:${MUTED};">An evaluation is one coach's feedback. It is not a recruiting contact, offer, scholarship, admission decision, or roster spot.</span>`),
    footerHtml: `Questions? Just reply to this email and include ${esc(req.ref)}.`,
    postalAddress: a.postalAddress,
  });
  const text = `Your request ${req.ref} was sent to ${coach.full_name}. ${money(req.price_cents)} is held on your card and charged only when your video is delivered. Video by ${dateOnly(
    req.expires_at,
  )}, or the hold is released and you're never charged.\n\nAn evaluation is feedback only — not a recruiting contact, offer, or scholarship.\n${a.postalAddress}`;
  return { subject, html, text };
}

export function purchaserDelivered(a: { req: EvalRequest; coach: Coach; videoUrl: string; postalAddress: string }): Rendered {
  const { req, coach } = a;
  const subject = `${coach.full_name} sent ${req.athlete_name.split(" ")[0]}'s video evaluation`;
  const html = layout({
    preheader: "Your private video evaluation is ready to watch.",
    heading: "Your video evaluation is ready",
    bodyHtml:
      p(`<strong>${esc(coach.full_name)}</strong> recorded a personal evaluation of ${esc(req.athlete_name)}'s film. Tap below to watch it — the link is private to you, so please don't post it publicly.`),
    cta: { label: "Watch the evaluation", url: a.videoUrl },
    footerHtml: `Reference ${esc(req.ref)}. This link is private; anyone with it can watch the video. Reply to this email to have it revoked.`,
    postalAddress: a.postalAddress,
  });
  return { subject, html, text: `${coach.full_name} recorded your evaluation. Watch privately: ${a.videoUrl}\n\n${a.postalAddress}` };
}

export function purchaserRefunded(a: {
  req: EvalRequest; coach: Coach; why: RefundWhy; postalAddress: string;
  /** false = only a card hold existed, which we released (the normal case) */
  captured?: boolean;
}): Rendered {
  const { req, coach } = a;
  const reason =
    a.why === "declined"
      ? `${esc(coach.full_name)} wasn't able to take this request.`
      : a.why === "expired"
        ? `${esc(coach.full_name)} didn't record a video within the deadline.`
        : a.why === "unavailable"
          ? `${esc(coach.full_name)} is no longer accepting requests.`
          : `Your request was cancelled.`;
  if (!a.captured) {
    const html = layout({
      preheader: `You were not charged. We've released the ${money(req.price_cents)} hold on your card.`,
      heading: "You weren't charged",
      bodyHtml:
        p(`${reason} We've <strong>released the ${money(req.price_cents)} hold</strong> on your card — you were never charged. The pending amount usually disappears from your statement within a few days, depending on your bank.`) +
        p(`You're welcome to request a different coach any time.`),
      footerHtml: `Reference ${esc(req.ref)}.`,
      postalAddress: a.postalAddress,
    });
    return {
      subject: `You weren't charged — ${req.ref}`,
      html,
      text: `${reason.replace(/<[^>]+>/g, "")} We released the ${money(req.price_cents)} hold on your card; you were not charged (${req.ref}).\n${a.postalAddress}`,
    };
  }
  const subject = `Full refund issued — ${req.ref}`;
  const html = layout({
    preheader: `We've refunded ${money(req.price_cents)} to your original payment method.`,
    heading: "You've been fully refunded",
    bodyHtml:
      p(`${reason} We've issued a <strong>full refund of ${money(req.price_cents)}</strong> to your original payment method. Banks typically show it within 5–10 business days.`) +
      p(`You're welcome to request a different coach any time.`),
    footerHtml: `Reference ${esc(req.ref)}.`,
    postalAddress: a.postalAddress,
  });
  return {
    subject,
    html,
    text: `${reason.replace(/<[^>]+>/g, "")} We refunded ${money(req.price_cents)} (${req.ref}). It typically appears in 5–10 business days.\n${a.postalAddress}`,
  };
}

export function coachPayoutSetup(a: { coach: Coach; amountCents: number; setupUrl: string; postalAddress: string }): Rendered {
  const subject = `Claim your ${money(a.amountCents)} — 3-minute payout setup`;
  const html = layout({
    preheader: "Your video was delivered. Connect your bank via Stripe to get paid.",
    heading: "Thanks — your video was delivered",
    bodyHtml:
      p(`The family has your evaluation. To receive <strong>${money(a.amountCents)}</strong>, complete a one-time secure payout setup with Stripe, our payments partner. Stripe collects your bank details and verifies your identity directly — The Athlete Market never sees your bank credentials.`) +
      p(`<span style="font-size:13px;color:${MUTED};">Once Stripe verifies you, payment is sent automatically. Bank arrival timing follows Stripe's payout schedule (often 2 business days).</span>`),
    cta: { label: "Set up payouts", url: a.setupUrl },
    postalAddress: a.postalAddress,
  });
  return { subject, html, text: `Set up payouts to receive ${money(a.amountCents)}: ${a.setupUrl}\n${a.postalAddress}` };
}

export function coachPaid(a: { req: EvalRequest; coach: Coach; dashboardUrl: string; postalAddress: string }): Rendered {
  const subject = `You've been paid ${money(a.req.coach_payout_cents)} for ${a.req.athlete_name}'s evaluation`;
  const html = layout({
    preheader: "Payment sent to your Stripe account.",
    heading: `${money(a.req.coach_payout_cents)} is on its way`,
    bodyHtml: p(
      `Thanks for evaluating ${esc(a.req.athlete_name)}. We've sent ${money(a.req.coach_payout_cents)} to your Stripe account; it will reach your bank on Stripe's normal payout schedule.`,
    ),
    cta: { label: "View payouts in Stripe", url: a.dashboardUrl },
    footerHtml: `Reference ${esc(a.req.ref)}.`,
    postalAddress: a.postalAddress,
  });
  return { subject, html, text: `${money(a.req.coach_payout_cents)} sent for ${a.req.ref}. Payouts: ${a.dashboardUrl}` };
}

export function adminAlert(a: { title: string; lines: string[]; url?: string; postalAddress: string }): Rendered {
  const html = layout({
    preheader: a.title,
    heading: a.title,
    bodyHtml: a.lines.map((l) => p(esc(l))).join(""),
    cta: a.url ? { label: "Open in admin", url: a.url } : undefined,
    postalAddress: a.postalAddress,
  });
  return { subject: `[TAM alert] ${a.title}`, html, text: [a.title, ...a.lines, a.url ?? ""].join("\n") };
}
