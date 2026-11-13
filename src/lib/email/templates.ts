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

function takeawaysHtml(req: EvalRequest): string {
  const items = [["Top strength", req.takeaway_strength], ["Work on", req.takeaway_improve], ["Next step", req.takeaway_next]].filter(([, v]) => v);
  if (!items.length) return "";
  return `<div style="margin:0 0 14px;padding:14px 16px;background:#F4F6FB;border-radius:12px;">` +
    items.map(([k, v]) => `<p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:${NAVY};"><strong>${esc(k)}:</strong> ${esc(v)}</p>`).join("") +
    `</div>`;
}

export function coachWelcome(a: { coach: Coach; hubUrl: string; postalAddress: string }): Rendered {
  const html = layout({
    preheader: "Confirm your email and your coach profile goes live.",
    heading: `Welcome to The Athlete Market, Coach ${a.coach.full_name.split(" ").slice(-1)[0]}`,
    bodyHtml:
      p(`Tap below to <strong>confirm your email</strong> — families can request you right away.`) +
      p(`While you're there: finish the <strong>3-minute Stripe payout setup</strong> so every evaluation pays you instantly (Stripe collects your bank details directly — we never see them), and record a short <strong>intro video</strong> for your profile.`) +
      p(`<span style="font-size:13px;color:${MUTED};">Every request shows the athlete, the film and what you'll earn. You choose which ones to take.</span>`),
    cta: { label: "Confirm & open my coach hub", url: a.hubUrl },
    postalAddress: a.postalAddress,
  });
  return { subject: "Confirm your email — your coach profile goes live", html, text: `Confirm your email and open your coach hub: ${a.hubUrl}\n${a.postalAddress}` };
}

export function familyFilmIssue(a: { req: EvalRequest; coach: Coach; fixUrl: string; postalAddress: string }): Rendered {
  const html = layout({
    preheader: "The coach couldn't open your film link. It takes 30 seconds to fix.",
    heading: "Quick fix needed: your film link",
    bodyHtml:
      p(`${esc(a.coach.full_name)} tried to watch ${esc(a.req.athlete_name)}'s film but <strong>couldn't open the link</strong> — it's usually set to private.`) +
      (a.req.film_issue_note ? p(`<span style="color:${MUTED};">Coach's note: “${esc(a.req.film_issue_note)}”</span>`) : "") +
      p(`Tap below to paste a working link. You still haven't been charged, and if it isn't fixed in time the hold is simply released.`),
    cta: { label: "Fix my film link", url: a.fixUrl },
    footerHtml: `Reference ${esc(a.req.ref)}.`,
    postalAddress: a.postalAddress,
  });
  return { subject: `Action needed: the coach couldn't open your film (${a.req.ref})`, html, text: `${a.coach.full_name} couldn't open your film link. Fix it here: ${a.fixUrl}\n${a.postalAddress}` };
}

export function coachWeekly(a: { coach: Coach; count: number; earnedCents: number; openCount: number; hubUrl: string; postalAddress: string }): Rendered {
  const html = layout({
    preheader: `You earned ${money(a.earnedCents)} this week.`,
    heading: `You earned ${money(a.earnedCents)} this week`,
    bodyHtml:
      p(`Thanks for delivering <strong>${a.count} evaluation${a.count === 1 ? "" : "s"}</strong> this week. Payments are on their way to your bank on Stripe's schedule.`) +
      (a.openCount ? p(`You have <strong>${a.openCount} open request${a.openCount === 1 ? "" : "s"}</strong> waiting.`) : ""),
    cta: { label: a.openCount ? "See open requests" : "Open my coach hub", url: a.hubUrl },
    postalAddress: a.postalAddress,
  });
  return { subject: `You earned ${money(a.earnedCents)} this week`, html, text: `You earned ${money(a.earnedCents)} this week (${a.count} evaluations). Hub: ${a.hubUrl}` };
}

/** One email per coach when several families are waiting (high volume: never one email per request). */
export function coachDigest(a: {
  coach: Coach; items: { req: EvalRequest; url: string }[]; hubUrl: string; unsubscribeUrl: string; postalAddress: string; finalDay: boolean;
}): Rendered {
  const total = a.items.reduce((s, i) => s + i.req.coach_payout_cents, 0);
  const n = a.items.length;
  const soonest = a.items.map((i) => i.req.expires_at!).sort()[0]!;
  const subject = a.finalDay
    ? `Last day: ${money(total)} waiting from ${n} famil${n === 1 ? "y" : "ies"}`
    : `${n} famil${n === 1 ? "y is" : "ies are"} waiting on you — ${money(total)}`;
  const rows = a.items.map((i) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #EEF1F7;font-size:14px;color:${NAVY};"><strong>${esc(i.req.athlete_name)}</strong><br><span style="color:${MUTED};">${esc(i.req.sport)} · ${esc(i.req.position)} · ${esc(i.req.grad_year)} · by ${esc(dateOnly(i.req.expires_at))}</span></td>` +
    `<td style="padding:10px 0;border-bottom:1px solid #EEF1F7;text-align:right;white-space:nowrap;"><span style="font-weight:700;color:#0A7A3E;">${money(i.req.coach_payout_cents)}</span><br><a href="${esc(i.url)}" style="color:${BLUE};font-size:14px;font-weight:600;">Record →</a></td></tr>`).join("");
  const html = layout({
    preheader: `${money(total)} in evaluation requests. 30–60 seconds each, right from your phone.`,
    heading: a.finalDay ? `Last chance: ${money(total)} is waiting` : `${money(total)} in requests is waiting for you`,
    bodyHtml:
      p(`${n} famil${n === 1 ? "y has" : "ies have"} asked for your honest feedback. Each one is a <strong>30–60 second video</strong> recorded in your browser — no account, no app.`) +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 14px;">${rows}</table>` +
      p(`<span style="font-size:13px;color:${MUTED};">First deadline: ${esc(dateOnly(soonest))}. Anything you don't record is simply released — families are never charged.</span>`),
    cta: { label: "See all requests", url: a.hubUrl },
    footerHtml: `Busy? <a href="${esc(a.hubUrl)}" style="color:${MUTED};">Pause new requests</a>. <a href="${esc(a.unsubscribeUrl)}" style="color:${MUTED};">Never email me again</a>.`,
    postalAddress: a.postalAddress,
  });
  const text = [subject, "", ...a.items.map((i) => `${i.req.athlete_name} (${i.req.position}, ${i.req.grad_year}) — ${money(i.req.coach_payout_cents)}: ${i.url}`), "", `All requests: ${a.hubUrl}`, `Stop emails: ${a.unsubscribeUrl}`, a.postalAddress].join("\n");
  return { subject, html, text };
}

/** Text messages: short, branded, always with opt-out wording. */
export const sms = {
  coachNewRequest: (req: EvalRequest, url: string) =>
    `The Athlete Market: ${money(req.coach_payout_cents)} evaluation request — ${req.athlete_name}, ${req.position}, ${req.grad_year}. Record by ${dateOnly(req.expires_at)}: ${url} Reply STOP to opt out.`,
  coachReminder: (req: EvalRequest, url: string, daysLeft: number) =>
    `The Athlete Market: ${daysLeft} day${daysLeft === 1 ? "" : "s"} left to record ${req.athlete_name}'s evaluation (${money(req.coach_payout_cents)}): ${url} Reply STOP to opt out.`,
  coachDigest: (n: number, totalCents: number, url: string) =>
    `The Athlete Market: ${n} families are waiting on your video evaluation — ${money(totalCents)} total. See them: ${url} Reply STOP to opt out.`,
  coachFilmUpdated: (req: EvalRequest, url: string) =>
    `The Athlete Market: ${req.athlete_name}'s family sent a new film link. Record here: ${url}`,
  adminNewOrder: (req: EvalRequest, coach: Coach) =>
    `TAM: New order ${req.ref} — ${coach.full_name} ← ${req.athlete_name} (${req.sport}), ${money(req.price_cents)} held.`,
  adminReview: (req: EvalRequest) => `TAM: Video for ${req.ref} is waiting for your review.`,
  adminLowRating: (req: EvalRequest, rating: number) => `TAM: ${req.ref} was rated ${rating}/5. Check the admin page.`,
};

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
  postalAddress: string; reminder?: { daysLeft: number; nudge?: boolean }; hubUrl?: string; otherOpen?: number; filmUpdated?: boolean;
}): Rendered {
  const { req, coach } = a;
  const pay = money(req.coach_payout_cents);
  const deadline = dateOnly(req.expires_at);
  const subject = a.filmUpdated
    ? `Updated film link: ${req.athlete_name} · ${pay}`
    : a.reminder?.nudge
    ? `${pay} is still waiting for you — ${req.athlete_name}'s evaluation`
    : a.reminder
    ? `Reminder: ${req.athlete_name}'s evaluation (${pay}) — ${a.reminder.daysLeft} day${a.reminder.daysLeft === 1 ? "" : "s"} left`
    : `${pay} evaluation request: ${req.athlete_name} · ${req.position} · ${req.grad_year}`;
  const html = layout({
    preheader: `${req.athlete_name} (${req.grad_year} ${req.position}) asked for a 30–60s video evaluation. You earn ${pay}.`,
    heading: a.reminder ? `${a.reminder.daysLeft} day${a.reminder.daysLeft === 1 ? "" : "s"} left to record` : `Coach ${coach.full_name.split(" ").slice(-1)[0]}, you have a paid evaluation request`,
    bodyHtml:
      (a.filmUpdated ? p(`<strong>The family sent a new film link</strong> — thanks for flagging it. Everything else is the same.`) : "") +
      (coach.stripe_transfers_active
        ? ""
        : p(`<strong>A family chose you</strong> and is offering <strong>${pay}</strong> for your honest take on their athlete's film. You don't need to sign up for anything.`) +
          (a.hubUrl ? p(`<span style="font-size:13px;color:${MUTED};">New to The Athlete Market? Families find coaches like you and pay for short video feedback. <a href="${esc(a.hubUrl)}" style="color:${BLUE};">Claim your free coach profile</a> to set your price, add a photo and get paid instantly.</span>`) : "")) +
      p(`Record a <strong>30–60 second video</strong> right from your phone's browser — no account, no app, no password.`) +
      table([
        row("Athlete", esc(req.athlete_name)),
        row("Sport · Position", `${esc(req.sport)} · ${esc(req.position)}`),
        row("Class of", esc(req.grad_year)),
        row("Highlight film", `<a href="${esc(req.film_url)}" style="color:${BLUE};">Watch film ↗</a>`),
        row("You receive", `<span style="color:#0A7A3E;">${pay}</span>`),
        row("Respond by", esc(deadline)),
      ]) +
      p(`<span style="font-size:13px;color:${MUTED};">${esc(NO_PROMISE)} ${coach.stripe_transfers_active
        ? "Payment is sent automatically via Stripe as soon as your video is delivered."
        : "After you submit, a quick one-time Stripe setup (about 3 minutes) sends the money to your bank."} If you decline or don't respond by the deadline, the family is simply never charged.</span>`) +
      (a.otherOpen && a.hubUrl ? p(`You have <strong>${a.otherOpen} other open request${a.otherOpen === 1 ? "" : "s"}</strong>. <a href="${esc(a.hubUrl)}" style="color:${BLUE};">See them all</a>.`) : ""),
    cta: { label: "Review & Record", url: a.reviewUrl },
    secondary: { label: "Decline this request", url: a.declineUrl },
    footerHtml: `You received this because a family requested an evaluation from you on The Athlete Market. Participation is entirely optional.${a.hubUrl ? ` Busy? <a href="${esc(a.hubUrl)}" style="color:${MUTED};">Pause new requests</a>.` : ""} <a href="${esc(a.unsubscribeUrl)}" style="color:${MUTED};">Never email me again</a>.`,
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

export function purchaserDelivered(a: { req: EvalRequest; coach: Coach; videoUrl: string; availableUntil: Date | null; postalAddress: string; secondOpinionUrl?: string }): Rendered {
  const until = a.availableUntil ? dateOnly(a.availableUntil.toISOString()) : null;
  const { req, coach } = a;
  const subject = `${coach.full_name} sent ${req.athlete_name.split(" ")[0]}'s video evaluation`;
  const html = layout({
    preheader: "Your private video evaluation is ready to watch.",
    heading: "Your video evaluation is ready",
    bodyHtml:
      p(`<strong>${esc(coach.full_name)}</strong> recorded a personal evaluation of ${esc(req.athlete_name)}'s film. Tap below to watch it — the link is private to you, so please don't post it publicly.`) +
      takeawaysHtml(req) +
      (until ? p(`<strong>Download it to keep it.</strong> For privacy, the video is automatically deleted after <strong>${esc(until)}</strong>. Use the download button on the video page.`) : ""),
    cta: { label: "Watch the evaluation", url: a.videoUrl },
    secondary: a.secondOpinionUrl ? { label: "Get a second coach's take →", url: a.secondOpinionUrl } : undefined,
    footerHtml: `Reference ${esc(req.ref)}. This link is private; anyone with it can watch the video. Reply to this email to have it revoked.`,
    postalAddress: a.postalAddress,
  });
  return { subject, html, text: `${coach.full_name} recorded your evaluation. Watch privately: ${a.videoUrl}${until ? `\n\nDownload it to keep it — the video is automatically deleted after ${until}.` : ""}\n\n${a.postalAddress}` };
}

export function purchaserRefunded(a: {
  req: EvalRequest; coach: Coach; why: RefundWhy; postalAddress: string;
  /** false = only a card hold existed, which we released (the normal case) */
  captured?: boolean;
  /** One-tap "request another coach" with the athlete's details pre-filled. */
  retryUrl?: string;
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
        p(a.retryUrl ? `<strong>Still want feedback for ${esc(req.athlete_name.split(" ")[0])}?</strong> Pick another coach — your details are already saved, it takes 30 seconds.` : `You're welcome to request a different coach any time.`),
      cta: a.retryUrl ? { label: "Request another coach", url: a.retryUrl } : undefined,
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
