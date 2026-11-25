import { env } from "../env";
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

/** Email replies only work once inbound email (Postmark) is set up. */
const replyEnabled = () => !!process.env.INBOUND_WEBHOOK_SECRET?.trim();
const NAVY = "#0A0D14";
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
<tr><td style="padding:18px 28px;background:${NAVY};color:#fff;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;"><img src="${env.siteUrl()}/brand/logo-white.png" width="44" height="36" alt="The Athlete Market" style="display:block;border:0;height:36px;width:auto;"></td>
<td style="vertical-align:middle;padding-left:12px;border-left:1px solid rgba(255,255,255,.25);"><div style="font-size:14px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;line-height:1;">Coach Line</div><div style="font-size:9.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-top:4px;line-height:1;">by The Athlete Market</div></td>
</tr></table></td></tr>
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
  coach: Coach; items: { req: EvalRequest; url: string; replyUrl?: string }[]; hubUrl: string; unsubscribeUrl: string; postalAddress: string; finalDay: boolean;
}): Rendered {
  const total = a.items.reduce((s, i) => s + i.req.coach_payout_cents, 0);
  const n = a.items.length;
  const soonest = a.items.map((i) => i.req.expires_at!).sort()[0]!;
  const subject = a.finalDay
    ? `Last day: ${money(total)} waiting from ${n} famil${n === 1 ? "y" : "ies"}`
    : `${n} famil${n === 1 ? "y is" : "ies are"} waiting on you — ${money(total)}`;
  const rows = a.items.map((i) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #EEF1F7;font-size:14px;color:${NAVY};"><strong>${esc(i.req.athlete_name)}</strong><br><span style="color:${MUTED};">${esc(FORMAT_WORD[i.req.format])} · ${esc(i.req.position)} · ${esc(i.req.grad_year)} · by ${esc(dateOnly(i.req.expires_at))}</span></td>` +
    `<td style="padding:10px 0;border-bottom:1px solid #EEF1F7;text-align:right;white-space:nowrap;"><span style="font-weight:700;color:#0A7A3E;">${money(i.req.coach_payout_cents)}</span><br><a href="${esc(i.req.format === "video" || !i.replyUrl ? i.url : i.replyUrl)}" style="color:${BLUE};font-size:14px;font-weight:600;">${i.req.format === "video" ? "Record" : "Reply"} →</a></td></tr>`).join("");
  const html = layout({
    preheader: `${money(total)} in requests. Reply from your inbox — about 2 minutes each.`,
    heading: a.finalDay ? `Last chance: ${money(total)} is waiting` : `${money(total)} in requests is waiting for you`,
    bodyHtml:
      p(`${n} famil${n === 1 ? "y has" : "ies have"} asked for your honest feedback. Tap <strong>Reply</strong> on each one — your email app opens with the template ready. Most take about 2 minutes.`) +
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
    `The Athlete Market: ${money(req.coach_payout_cents)} for a ${FORMAT_WORD[req.format]} — ${req.athlete_name}, ${req.position}, ${req.grad_year}. Check your email to reply (by ${dateOnly(req.expires_at)}): ${url} Reply STOP to opt out.`,
  parentSent: (req: EvalRequest, coachName: string) =>
    `The Athlete Market: your request went to ${coachName}. We'll text you the moment they reply. You're only charged if they do. Reply STOP to opt out.`,
  parentReplied: (req: EvalRequest, coachName: string) =>
    `The Athlete Market: ${coachName} replied about ${req.athlete_name.split(" ")[0]}! Check your email (${req.purchaser_email}).`,
  parentReleased: (req: EvalRequest, coachName: string, url: string) =>
    `The Athlete Market: ${coachName} couldn't reply in time — you were NOT charged. Pick another coach (details saved): ${url}`,
  coachReminder: (req: EvalRequest, url: string, daysLeft: number) =>
    `The Athlete Market: ${daysLeft} day${daysLeft === 1 ? "" : "s"} left to record ${req.athlete_name}'s evaluation (${money(req.coach_payout_cents)}): ${url} Reply STOP to opt out.`,
  coachDigest: (n: number, totalCents: number, url: string) =>
    `The Athlete Market: ${n} families are waiting on your reply — ${money(totalCents)} total. Check your email or see them: ${url} Reply STOP to opt out.`,
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


const FORMAT_WORD: Record<EvalRequest["format"], string> = { written: "written take", voice: "voice note", video: "video breakdown", ask: "message" };
const HOW_TO: Record<EvalRequest["format"], string> = {
  written: "Just <strong>hit Reply</strong> and fill in the short template below — about 2 minutes. No account, no app.",
  voice: "<strong>Hit Reply and attach a 1–2 minute voice memo</strong> (iPhone: Voice Memos → ••• → Share → Mail). Add a line or two in the template if you like.",
  video: "<strong>Tap Record</strong> to film 30–60 seconds right in your browser — or hit Reply and attach a short video or a link.",
  ask: "Answer in one tap below — or just hit Reply.",
};

function templateBlock(template: string) {
  return `<pre style="margin:6px 0 16px;padding:14px 16px;background:#F4F6FB;border-radius:12px;font:14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${NAVY};white-space:pre-wrap;">${esc(template)}</pre>`;
}

const GROWTH_FOOTER = `Want feedback from another coach? <a href="https://marketplace.theathletemarket.com" style="color:${BLUE};">Get your own evaluation at theathletemarket.com</a>.`;

export function coachInvite(a: {
  req: EvalRequest; coach: Coach; reviewUrl: string; declineUrl: string; unsubscribeUrl: string;
  postalAddress: string; reminder?: { daysLeft: number; nudge?: boolean }; hubUrl?: string; otherOpen?: number; filmUpdated?: boolean;
  mailtoUrl?: string; template?: string;
}): Rendered {
  const { req, coach } = a;
  const pay = money(req.coach_payout_cents);
  const what = FORMAT_WORD[req.format];
  const deadline = dateOnly(req.expires_at);
  const subject = a.filmUpdated
    ? `Updated film link: ${req.athlete_name} · ${pay}`
    : a.reminder?.nudge
    ? `${pay} is still waiting for you — ${req.athlete_name} (${what})`
    : a.reminder
    ? `${a.reminder.daysLeft} day${a.reminder.daysLeft === 1 ? "" : "s"} left: ${pay} for ${req.athlete_name}'s ${what}`
    : `${pay} for a ${what}: ${req.athlete_name} · ${req.position} · ${req.grad_year}`;
  const primary = req.format === "video" ? { label: "● Record (60 sec, no login)", url: a.reviewUrl } : a.mailtoUrl ? { label: "Reply now", url: a.mailtoUrl } : { label: "Open request", url: a.reviewUrl };
  const html = layout({
    preheader: `${req.athlete_name} (${req.grad_year} ${req.position}) wants your ${what}. You earn ${pay} — reply from this email.`,
    heading: a.reminder ? `${a.reminder.daysLeft} day${a.reminder.daysLeft === 1 ? "" : "s"} left — ${pay} is waiting` : `Coach ${coach.full_name.split(" ").slice(-1)[0]}, a family wants your ${what}`,
    bodyHtml:
      (a.filmUpdated ? p(`<strong>The family sent a new film link</strong> — thanks for flagging it. Everything else is the same.`) : "") +
      (coach.stripe_transfers_active ? "" : p(`<strong>A family chose you</strong> and is paying <strong>${pay}</strong> for your honest take. You don't need to sign up for anything.`)) +
      p(HOW_TO[req.format]) +
      table([
        row("Athlete", esc(req.athlete_name)),
        row("Sport · Position", `${esc(req.sport)} · ${esc(req.position)}`),
        row("Class of", esc(req.grad_year)),
        row("Highlight film", `<a href="${esc(req.film_url)}" style="color:${BLUE};">Watch film ↗</a>`),
        row("You receive", `<span style="color:#0A7A3E;">${pay}</span>`),
        row("Reply by", esc(deadline)),
      ]) +
      (req.message ? p(`<span style="color:${MUTED};">Note from the family: “${esc(req.message)}”</span>`) : "") +
      (a.template ? p(`<strong>Reply template</strong> — fill it in and send:`) + templateBlock(a.template) : "") +
      (req.format !== "video" ? p(`<span style="font-size:13px;color:${MUTED};">On a computer and “Reply now” doesn't open anything? <a href="${esc(a.reviewUrl)}" style="color:${BLUE};">Type your reply on the request page</a>.</span>`) : "") +
      p(`<span style="font-size:13px;color:${MUTED};">${coach.stripe_transfers_active
        ? "Payment is sent automatically via Stripe as soon as your reply is delivered."
        : "After you reply, a quick one-time Stripe setup (about 3 minutes) sends the money to your bank."} Not for you? Reply <strong>PASS</strong> — the family is never charged.</span>`) +
      (!coach.stripe_transfers_active && a.hubUrl ? p(`<span style="font-size:13px;color:${MUTED};">New to The Athlete Market? <a href="${esc(a.hubUrl)}" style="color:${BLUE};">Claim your free coach profile</a> to get paid instantly on every reply.</span>`) : "") +
      (a.otherOpen && a.hubUrl ? p(`You have <strong>${a.otherOpen} other open request${a.otherOpen === 1 ? "" : "s"}</strong>. <a href="${esc(a.hubUrl)}" style="color:${BLUE};">See them all</a>.`) : ""),
    cta: primary,
    secondary: req.format === "video" && a.mailtoUrl ? { label: "Or reply by email with a video / link", url: a.mailtoUrl } : { label: "Not for me — decline", url: a.declineUrl },
    footerHtml: `A family requested your feedback through The Athlete Market. Participation is optional — <a href="${esc(a.declineUrl)}" style="color:${MUTED};">decline this request</a>.${a.hubUrl ? ` Busy? <a href="${esc(a.hubUrl)}" style="color:${MUTED};">Pause new requests</a>.` : ""} <a href="${esc(a.unsubscribeUrl)}" style="color:${MUTED};">Never email me again</a>.`,
    postalAddress: a.postalAddress,
  });
  const text = [
    subject, "",
    HOW_TO[req.format].replace(/<[^>]+>/g, ""), "",
    `Athlete: ${req.athlete_name}`, `Sport/Position: ${req.sport} / ${req.position}`, `Class of: ${req.grad_year}`,
    `Film: ${req.film_url}`, `You receive: ${pay}`, `Reply by: ${deadline}`, "",
    ...(a.template ? ["--- Reply template ---", a.template, "----------------------", ""] : []),
    req.format === "video" ? `Record: ${a.reviewUrl}` : `Or type your reply here: ${a.reviewUrl}`, `Not for you? Reply PASS.`, "",
    `Stop all emails: ${a.unsubscribeUrl}`, a.postalAddress,
  ].filter((l) => l !== undefined).join("\n");
  return { subject, html, text };
}

/** Auto-reply when a coach's reply can't be accepted yet (too short / missing the voice memo or video / closed). */
export function coachReplyNeedsMore(a: {
  req: EvalRequest; coach: Coach; kind: "too_short" | "needs_media" | "closed"; recordUrl: string; template: string; postalAddress: string;
}): Rendered {
  const { req } = a;
  const what = FORMAT_WORD[req.format];
  const body =
    a.kind === "closed"
      ? p(`Thanks for replying! This request for ${esc(req.athlete_name)} has already closed, so nothing more is needed — the family wasn't charged.`)
      : a.kind === "too_short"
      ? p(`Thanks! Your reply came through but it's a little short for a ${what}. Could you reply once more with a few sentences — the template below makes it quick:`) + templateBlock(a.template)
      : req.format === "voice"
      ? p(`Thanks! We didn't find a voice memo attached. Reply once more with a 1–2 minute voice memo (iPhone: Voice Memos → ••• → Share → Mail).`)
      : p(`Thanks! We didn't find a video attached. <a href="${esc(a.recordUrl)}" style="color:${BLUE};font-weight:600;">Tap here to record 60 seconds in your browser</a>, or reply with a video or a link.`);
  const html = layout({
    preheader: a.kind === "closed" ? "This request has closed." : "Almost there — one quick fix.",
    heading: a.kind === "closed" ? "This request has closed" : "Almost there",
    bodyHtml: body,
    footerHtml: `Reference ${esc(req.ref)}.`,
    postalAddress: a.postalAddress,
  });
  return { subject: a.kind === "closed" ? `Closed: ${req.athlete_name}'s request` : `Almost there: ${req.athlete_name}'s ${what}`, html, text: body.replace(/<[^>]+>/g, "") + `\n\n${a.postalAddress}` };
}

export function purchaserReceipt(a: { req: EvalRequest; coach: Coach; postalAddress: string }): Rendered {
  const { req, coach } = a;
  const subject = `Request sent to ${coach.full_name} (${req.ref})`;
  const html = layout({
    preheader: `We've emailed ${coach.full_name}. You're only charged when your video is delivered.`,
    heading: "Your request is on its way",
    bodyHtml:
      p(`We've emailed <strong>${esc(coach.full_name)}</strong> your request for a <strong>${FORMAT_WORD[req.format]}</strong> on ${esc(req.athlete_name)}. You'll get their reply right here in your inbox${req.purchaser_sms_opt_in_at ? " — and a text the moment it arrives" : ""}.`) +
      table([
        row("Reference", esc(req.ref)),
        row("Card hold", `${money(req.price_cents)} <span style="font-weight:400;color:${MUTED};">(charged only on delivery)</span>`),
        row("Reply by", esc(dateOnly(req.expires_at))),
      ]) +
      p(`<strong>Guaranteed:</strong> your card is only charged when ${esc(coach.full_name.split(" ")[0])} replies. If they pass or don't reply by the deadline, the hold is released and we'll help you pick another coach in one tap.`) +
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
  const first = req.athlete_name.split(" ")[0];
  const media = !!req.video_path || !!req.response_link;
  const mediaWord = req.response_kind === "voice" ? "voice note" : "video";
  const subject = `${coach.full_name} replied: ${first}'s ${FORMAT_WORD[req.format]}`;
  const where = [coach.title, coach.school].filter(Boolean).join(", ");
  const level = req.level_read
    ? `<div style="margin:0 0 14px;padding:14px 16px;background:#0A0D14;border-radius:12px;color:#fff;"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8FB0FF;">Level ${esc(coach.full_name.split(" ")[0])} sees ${esc(first)} at</div><div style="font-size:20px;font-weight:700;margin-top:4px;">${esc(req.level_read)}</div></div>`
    : "";
  const written = req.response_text
    ? `<div style="margin:0 0 14px;padding:14px 16px;border-left:3px solid ${BLUE};background:#F4F6FB;border-radius:0 12px 12px 0;font-size:15px;line-height:1.6;color:${NAVY};white-space:pre-wrap;">${esc(req.response_text)}</div>`
    : "";
  const html = layout({
    preheader: req.level_read ? `Level: ${req.level_read}. Read ${coach.full_name}'s full reply.` : `Read ${coach.full_name}'s reply about ${first}.`,
    heading: `${coach.full_name} replied`,
    bodyHtml:
      p(`<span style="color:${MUTED};">${esc(where)}</span>`) +
      level +
      (req.response_text ? written : takeawaysHtml(req)) +
      (media ? p(`${esc(coach.full_name.split(" ")[0])} also sent a <strong>${mediaWord}</strong>.${until ? ` Download it to keep it — it's deleted for privacy after ${esc(until)}.` : ""}`) : "") +
      p(`<span style="font-size:13px;color:${MUTED};">Tip: forward this email to other coaches or your club coach — it's yours to share.</span>`),
    cta: media ? { label: req.response_kind === "voice" ? "▶ Listen to the voice note" : "▶ Watch the video", url: a.videoUrl } : { label: "Rate this reply", url: a.videoUrl },
    secondary: a.secondOpinionUrl ? { label: "Get a second coach's take →", url: a.secondOpinionUrl } : undefined,
    footerHtml: `Reference ${esc(req.ref)}. ${GROWTH_FOOTER}`,
    postalAddress: a.postalAddress,
  });
  const text = [
    `${coach.full_name} replied about ${req.athlete_name}.`, "",
    ...(req.level_read ? [`Level: ${req.level_read}`, ""] : []),
    ...(req.response_text ? [req.response_text, ""] : []),
    media ? `${req.response_kind === "voice" ? "Listen" : "Watch"}: ${a.videoUrl}${until ? ` (download it to keep it — deleted after ${until})` : ""}` : `Rate this reply: ${a.videoUrl}`,
    "", "Get your own evaluation at theathletemarket.com", a.postalAddress,
  ].join("\n");
  return { subject, html, text };
}

export function purchaserRefunded(a: {
  req: EvalRequest; coach: Coach; why: RefundWhy; postalAddress: string;
  /** false = only a card hold existed, which we released (the normal case) */
  captured?: boolean;
  /** One-tap "request another coach" with the athlete's details pre-filled. */
  retryUrl?: string;
}): Rendered {
  const { req, coach } = a;
  const reason = req.format === "ask"
    ? (a.why === "declined" || a.why === "expired"
        ? (req.target_school === coach.full_name ? `${esc(coach.full_name)} didn't answer in time.` : `No one on the ${esc(req.target_school ?? coach.school ?? "")} staff answered in time.`)
        : `We couldn't reach the ${esc(req.target_school ?? coach.school ?? "")} staff.`)
    : a.why === "declined"
      ? `${esc(coach.full_name)} wasn't able to take this request.`
      : a.why === "expired"
        ? `${esc(coach.full_name)} didn't record a video within the deadline.`
        : a.why === "unavailable"
          ? `${esc(coach.full_name)} is no longer accepting requests.`
          : `Your request was cancelled.`;
  if (!a.captured && req.format === "ask" && req.price_cents === 0) {
    const school = req.target_school ?? coach.school ?? "that school";
    const html = layout({
      preheader: `No answer from ${school} this time.`,
      heading: `No answer from ${school} this time`,
      bodyHtml: p(`${reason} Coaches get busy — the best move is to reach a few more programs.`) +
        p(`Your athlete's details are saved, so it takes 30 seconds.`),
      cta: a.retryUrl ? { label: "Ask another school", url: a.retryUrl } : undefined,
      footerHtml: `Reference ${esc(req.ref)}.`,
      postalAddress: a.postalAddress,
    });
    return { subject: `No answer from ${school} — try another school`, html, text: `${reason.replace(/<[^>]+>/g, "")} Ask another school: ${a.retryUrl ?? ""}\n${a.postalAddress}` };
  }
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

export function coachPayoutSetup(a: { coach: Coach; amountCents: number; setupUrl: string; postalAddress: string; athlete?: string }): Rendered {
  const subject = `Get paid for your answer — set up payouts`;
  const html = layout({
    preheader: `You earned ${money(a.amountCents)}. Connect your bank with Stripe to get paid.`,
    heading: `You earned ${money(a.amountCents)} — let's get it to you`,
    bodyHtml:
      p(`Thanks, Coach. ${a.athlete ? `${esc(a.athlete)}'s family has your answer. ` : "The family has your answer. "}To receive <strong>${money(a.amountCents)}</strong>, do a one-time, 3-minute payout setup with Stripe, our payments partner. Stripe collects your bank details and verifies your identity directly — The Athlete Market never sees your bank credentials.`) +
      p(`Your money is held safely until you finish, and every answer after that pays you automatically.`) +
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

/* ═════════════════════════════ Coach Line ═════════════════════════════ */


export function coachAskInvite(a: {
  req: EvalRequest; coach: Coach; answerUrl: (kind?: string) => string; declineUrl: string; unsubscribeUrl: string; hubUrl: string;
  postalAddress: string; earnCents: number; escalated?: boolean; reminder?: { daysLeft: number; nudge?: boolean };
  /** Fast-answer bonus still available: extra cents, and hours left to earn it. */
  bonus?: { cents: number; hoursLeft: number };
}): Rendered {
  // Deliverability first: school mail (Microsoft 365 / Google) junks designed, link-heavy email from new
  // senders. This one looks like a normal personal email — no images, plain styling, only 4 links.
  const { req, coach } = a;
  const pos = req.position.length <= 4 ? req.position.toUpperCase() : req.position;
  const about = req.target_school && req.target_school !== coach.full_name ? ` about ${req.target_school}` : "";
  const subject = a.reminder?.nudge
    ? `Following up: ${req.athlete_name} (${req.grad_year} ${pos})`
    : a.reminder
    ? `Re: question from ${req.athlete_name} (${req.grad_year} ${pos})`
    : `Question${about} from ${req.athlete_name} (${req.grad_year} ${pos})`;
  const last = coach.full_name.split(" ").slice(-1)[0];
  const total = a.earnCents + (a.bonus?.cents ?? 0);
  const pay = a.earnCents > 0
    ? a.bonus
      ? `Answer in the next ${a.bonus.hoursLeft} hours and you'll be paid ${money(total)} (${money(a.earnCents)} after that).`
      : `You'll be paid ${money(a.earnCents)} for answering.`
    : "";
  const lead = a.reminder?.nudge
    ? `Just following up — ${esc(req.athlete_name.split(" ")[0])}'s family is still hoping to hear from you.`
    : a.reminder
    ? `${a.reminder.daysLeft} day${a.reminder.daysLeft === 1 ? "" : "s"} left to answer ${esc(req.athlete_name)}'s question.`
    : a.escalated
    ? `${esc(req.athlete_name)}'s family is hoping to hear from someone on your staff${about ? `${esc(about.replace(" about", " at"))}` : ""}.`
    : `A family just reached out${esc(about)} through Coach Line:`;
  const P = (h: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#111;">${h}</p>`;
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:560px;padding:20px 18px;">
${P(`Coach ${esc(last)},`)}
${P(lead)}
<div style="margin:0 0 14px;padding:2px 0 2px 14px;border-left:3px solid #d0d7e2;font-size:15px;line-height:1.55;color:#222;white-space:pre-wrap;">${esc(req.message ?? "")}</div>
${P(`<strong>${esc(req.athlete_name)}</strong> · ${esc(pos)} · Class of ${esc(req.grad_year)} · ${esc(req.sport)}<br>Film: <a href="${esc(req.film_url)}" style="color:#1F5FFF;">${esc(req.film_url)}</a>`)}
${P(`You can answer from your phone in about 30 seconds — share camp dates, an event you'll be at, ask for more film, or give your honest read.${pay ? ` <strong>${pay}</strong>` : ""}`)}
<p style="margin:0 0 18px;"><a href="${esc(a.answerUrl())}" style="display:inline-block;padding:12px 20px;background:#1F5FFF;color:#ffffff;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">Answer${total > 0 ? ` &amp; get paid ${money(total)}` : ""}</a></p>
${replyEnabled() ? P(`<span style="color:#555;font-size:14px;">Or just reply to this email — your address stays private.</span>`) : ""}
${P(`Thanks,<br>Chase<br><span style="color:#555;">Coach Line · The Athlete Market</span>`)}
<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#888;">Not the right person? <a href="${esc(a.declineUrl)}" style="color:#888;">Pass it on</a> · <a href="${esc(a.unsubscribeUrl)}" style="color:#888;">Unsubscribe</a><br>${esc(a.postalAddress)}</p>
</div></body></html>`;
  const strip = (x: string) => x.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  const text = [
    `Coach ${last},`, "", strip(lead), "", req.message ?? "", "",
    `${req.athlete_name} · ${pos} · Class of ${req.grad_year} · ${req.sport}`, `Film: ${req.film_url}`, "",
    `Answer from your phone in about 30 seconds.${pay ? ` ${pay}` : ""}`, `Answer: ${a.answerUrl()}`, "",
    ...(replyEnabled() ? ["Or just reply to this email.", ""] : []),
    "Thanks,", "Chase", "Coach Line · The Athlete Market", "",
    `Not the right person? ${a.declineUrl}`, `Unsubscribe: ${a.unsubscribeUrl}`, a.postalAddress,
  ].join("\n");
  return { subject, html, text };
}

/** The coach's answer as an HTML card (camp / event / film / update / level / personal). */
export function answerCardHtml(req: EvalRequest, coach: Coach): string {
  const pl = (req.answer_payload ?? {}) as Record<string, string>;
  const note = pl.note ? `<p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:${NAVY};white-space:pre-wrap;">${esc(pl.note)}</p>` : "";
  const box = (title: string, inner: string) =>
    `<div style="margin:0 0 14px;padding:16px;border:1px solid #DCE6FF;border-radius:14px;background:#F6F9FF;"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${BLUE};font-weight:700;">${title}</div>${inner}${note}</div>`;
  switch (req.answer_kind) {
    case "camp":
      return box("Camp invitation", `<div style="font-size:19px;font-weight:700;margin-top:6px;color:${NAVY};">${esc(pl.name)}</div><div style="font-size:15px;color:${NAVY};margin-top:2px;">${esc(pl.dates)}${pl.location ? ` · ${esc(pl.location)}` : ""}</div>${pl.url ? `<a href="${esc(pl.url)}" style="display:inline-block;margin-top:12px;padding:11px 18px;background:${BLUE};color:#fff;border-radius:10px;font-weight:700;text-decoration:none;">Register for camp →</a>` : ""}`);
    case "event":
      return box(`${esc(coach.full_name.split(" ")[0])} will be at`, `<div style="font-size:19px;font-weight:700;margin-top:6px;color:${NAVY};">${esc(pl.name)}</div><div style="font-size:15px;color:${NAVY};margin-top:2px;">${esc(pl.dates)}${pl.location ? ` · ${esc(pl.location)}` : ""}</div>`);
    case "film":
      return box("More film requested", `<div style="font-size:16px;margin-top:6px;color:${NAVY};">The staff would like to see more — a full game or more clips. <strong>Reply to this email with the link</strong> and we'll pass it straight to them.</div>`);
    case "update":
      return box("Keep in touch", `<div style="font-size:16px;margin-top:6px;color:${NAVY};">Keep the staff updated${pl.when ? ` — ${esc(pl.when)}` : " after your season"}. Just reply to this email when you have new film or results.</div>`);
    case "level":
      return box("Honest level read", `<div style="font-size:19px;font-weight:700;margin-top:6px;color:${NAVY};">Better fit: ${esc(pl.level ?? "another level")}</div>`);
    default:
      return box(`Message from ${esc(coach.full_name)}`, "");
  }
}

/**
 * The coach's answer, written as a personal note to the family: greeting, why it matters, concrete next steps,
 * the coach's own words, and a sign-off. Built from the coach's one-tap answer + the family's details.
 */
export function personalAnswer(req: EvalRequest, coach: Coach): { paragraphs: string[]; steps: string[]; cta?: { label: string; url: string } } {
  const pl = (req.answer_payload ?? {}) as Record<string, string>;
  const kid = req.athlete_name.split(" ")[0]!;
  const pos = req.position.length <= 4 ? req.position.toUpperCase() : req.position;
  const profile = `a ${req.grad_year} ${pos}`;
  const school = coach.school ?? (req.target_school !== coach.full_name ? req.target_school : null);
  const program = school ? `our program at ${school}` : "our program";
  const note = pl.note?.trim();
  const followUp = replyEnabled() ? "just reply to this email" : `message me again on Coach Line`;
  const where = (pl.location ? ` at ${pl.location}` : "");
  switch (req.answer_kind) {
    case "camp":
      return {
        paragraphs: [
          `Thanks for reaching out about ${kid}. I took a look at the film you sent, and I'd like to get ${kid} in front of our staff in person.`,
          `Our <strong>${esc(pl.name)}</strong> is <strong>${esc(pl.dates)}</strong>${esc(where)}. Camp is the best way for us to evaluate ${profile} up close: we see the athleticism, the coachability and how ${kid} competes, which film can't fully show. A lot of our recruiting relationships start right there.`,
          ...(note ? [esc(note)] : []),
          `If ${kid} signs up, let me know so I can make a point to find ${kid} there.`,
        ],
        steps: [
          pl.url ? `Register for ${esc(pl.name)} (link below) — spots fill up.` : `Register for ${esc(pl.name)} through ${school ? esc(school) + "'s" : "the"} athletics website.`,
          `Bring updated measurables (height, weight, times) and be ready to introduce yourself to the staff.`,
          `Come in sharp on the fundamentals at ${esc(pos)} — that's what we evaluate first.`,
          `Afterward, ${followUp} with a quick thank-you and any new film.`,
        ],
        cta: pl.url ? { label: `Register for ${pl.name}`, url: pl.url } : undefined,
      };
    case "event":
      return {
        paragraphs: [
          `Thanks for reaching out about ${kid}, and for sending the film.`,
          `Our staff will be at <strong>${esc(pl.name)}</strong> (<strong>${esc(pl.dates)}</strong>${esc(where)}). If ${kid} is playing there, that's a great chance for us to see ${profile} in a live setting.`,
          ...(note ? [esc(note)] : []),
        ],
        steps: [
          `If ${kid}'s team is attending, ${followUp} with the team name, jersey number and game schedule so we can find ${kid}.`,
          `Play your game — we're watching effort and how ${kid} responds to mistakes, not just highlights.`,
          `After the event, send any new film or stats.`,
        ],
      };
    case "film":
      return {
        paragraphs: [
          `Thanks for reaching out about ${kid}. I appreciate you sending film.`,
          `Before I can give you an honest evaluation, I'd like to see more of ${kid} — ideally a full, unedited game. Highlights show the best moments; full games show us consistency, effort and decision-making, which is what we recruit on.`,
          ...(note ? [esc(note)] : []),
        ],
        steps: [
          `Send a full game (or two halves) — unedited, with ${kid}'s jersey number noted.`,
          `Put ${kid}'s best 5–8 plays at ${esc(pos)} in the first minute of the highlight reel.`,
          `Include current measurables and academics (GPA) with the film.`,
          `Then ${followUp} with the new link.`,
        ],
      };
    case "update":
      return {
        paragraphs: [
          `Thanks for reaching out about ${kid}. I'd like to keep following ${kid}'s progress.`,
          `Recruiting ${profile} is a process — we watch how athletes develop over a season. Keep me in the loop as ${kid} grows.`,
          ...(note ? [esc(note)] : []),
        ],
        steps: [
          `Send an update after the season: new film, stats and any measurable improvements.`,
          `Share ${kid}'s tournament or showcase schedule so we can try to see ${kid} live.`,
          `Keep grades up — it opens more doors than most families realize.`,
          `When you have something new, ${followUp}.`,
        ],
      };
    case "level": {
      const lvl = esc(pl.level ?? "another level");
      return {
        paragraphs: [
          `Thanks for reaching out about ${kid}, and for trusting me with an honest answer.`,
          `Based on the film, I see ${kid} as a better fit at the <strong>${lvl}</strong> level right now. That isn't a knock — it's where I think ${kid} would play early, develop the most and have the best experience. Plenty of great players take that path.`,
          ...(note ? [esc(note)] : []),
        ],
        steps: [
          `Build a list of 10–15 ${lvl} programs that fit ${kid} academically and athletically, and reach out to them directly.`,
          `Look for ${lvl} camps and showcases where those staffs recruit.`,
          `Keep developing — players' levels change, and updated film can change the conversation.`,
        ],
      };
    }
    default:
      return {
        paragraphs: [`Thanks for reaching out about ${kid}.`, ...(note ? [esc(note)] : [])],
        steps: [],
      };
  }
}

export function parentAnswer(a: {
  req: EvalRequest; coach: Coach; postalAddress: string; askAnotherUrl?: string; replyHint: boolean;
}): Rendered {
  const { req, coach } = a;
  const school = coach.school ?? (req.target_school !== coach.full_name ? req.target_school : null);
  const who = school ? `${coach.full_name} (${school})` : coach.full_name;
  const kid = req.athlete_name.split(" ")[0]!;
  const parentFirst = req.purchaser_name.split(" ")[0] || "there";
  const subject = `${who} answered ${kid} 🎉`;
  const letter = personalAnswer(req, coach);
  const last = coach.full_name.split(" ").slice(-1)[0];
  const sig = `<p style="margin:18px 0 0;font-size:15px;line-height:1.5;color:${NAVY};">— Coach ${esc(last)}<br><span style="color:${MUTED};font-size:14px;">${esc([coach.full_name, coach.title, school].filter(Boolean).join(" · "))}</span></p>`;
  const steps = letter.steps.length
    ? `<div style="margin:18px 0 0;padding:16px;border-radius:14px;background:#F6F9FF;border:1px solid #DCE6FF;"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${BLUE};font-weight:700;">Your next steps</div><ol style="margin:8px 0 0;padding-left:20px;font-size:15px;line-height:1.6;color:${NAVY};">${letter.steps.map((s) => `<li style="margin:4px 0;">${s}</li>`).join("")}</ol></div>`
    : "";
  const html = layout({
    preheader: `A personal answer from ${coach.full_name} about ${req.athlete_name}.`,
    heading: `A personal answer from ${coach.full_name}`,
    bodyHtml:
      `<div style="padding:4px 0 0;border-left:3px solid ${BLUE};padding-left:16px;">` +
      p(`Hi ${esc(parentFirst)},`) +
      letter.paragraphs.map((x) => p(x)).join("") +
      sig + `</div>` +
      steps +
      (letter.cta ? `<p style="margin:18px 0 0;"><a href="${esc(letter.cta.url)}" style="display:inline-block;padding:13px 20px;background:${BLUE};color:#fff;border-radius:12px;font-weight:700;text-decoration:none;">${esc(letter.cta.label)} →</a></p>` : "") +
      (replyEnabled()
        ? p(`<span style="font-size:13px;color:${MUTED};"><strong>Want to respond?</strong> Just reply to this email (or text us back) — we'll pass it straight to Coach ${esc(last)}. Your email and phone stay private.</span>`)
        : ""),
    cta: a.askAnotherUrl ? { label: "Ask another school", url: a.askAnotherUrl } : undefined,
    footerHtml: `Reference ${esc(req.ref)}. Sent through Coach Line by The Athlete Market.`,
    postalAddress: a.postalAddress,
  });
  const strip = (x: string) => x.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  const text = [
    `Hi ${parentFirst},`, "",
    ...letter.paragraphs.map(strip).flatMap((x) => [x, ""]),
    `— Coach ${last}`, [coach.full_name, coach.title, school].filter(Boolean).join(" · "), "",
    ...(letter.steps.length ? ["YOUR NEXT STEPS", ...letter.steps.map((x, i) => `${i + 1}. ${strip(x)}`), ""] : []),
    ...(letter.cta ? [`${letter.cta.label}: ${letter.cta.url}`, ""] : []),
    ...(a.askAnotherUrl ? [`Ask another school: ${a.askAnotherUrl}`, ""] : []),
    a.postalAddress,
  ].join("\n");
  return { subject, html, text };
}

/** A relayed follow-up message (parent ↔ coach), always from The Athlete Market. */
export function relayMessage(a: { toRole: "coach" | "parent"; fromName: string; req: EvalRequest; body: string; postalAddress: string }): Rendered {
  const subject = a.toRole === "coach"
    ? `Re: ${a.req.athlete_name} — new message from the family`
    : `Re: ${a.req.athlete_name} — new message from ${a.fromName}`;
  const html = layout({
    preheader: a.body.slice(0, 100),
    heading: a.toRole === "coach" ? `${a.req.athlete_name}'s family replied` : `${a.fromName} replied`,
    bodyHtml:
      `<div style="margin:0 0 14px;padding:14px 16px;border-left:3px solid ${BLUE};background:#F4F6FB;border-radius:0 12px 12px 0;font-size:15px;line-height:1.6;color:${NAVY};white-space:pre-wrap;">${esc(a.body)}</div>` +
      p(`<span style="font-size:13px;color:${MUTED};">Just hit Reply to answer. Email addresses stay private — The Athlete Market passes every message along.</span>`),
    footerHtml: `Reference ${esc(a.req.ref)}.`,
    postalAddress: a.postalAddress,
  });
  return { subject, html, text: `${a.body}\n\n— Hit Reply to answer. (${a.req.ref})\n${a.postalAddress}` };
}

export function orderReceipt(a: { email: string; name: string; athlete: string; schools: { school: string; price: number }[]; postalAddress: string; texts?: boolean }): Rendered {
  const free = a.schools.every((s) => s.price === 0);
  const rows = a.schools.map((s) => row(esc(s.school), free ? "Sent ✓" : `${money(s.price)} <span style="font-weight:400;color:${MUTED};">hold</span>`));
  const html = layout({
    preheader: free ? "Your message is on its way." : "Your message is on its way. You're only charged for schools that answer.",
    heading: "Your message is on its way",
    bodyHtml:
      p(`We're delivering your message about <strong>${esc(a.athlete)}</strong> to ${a.schools.length === 1 ? "this coaching staff" : `these ${a.schools.length} coaching staffs`}:`) +
      table(rows) +
      p(free
        ? `If the first coach doesn't answer, we automatically reach the next person on that staff.`
        : `<strong>Answered — or it's free.</strong> Each school is charged only if a coach there answers. If the first coach doesn't, we automatically reach the next person on that staff. No answer in 5 days? That hold is released.`) +
      p(a.texts ? `We'll text and email you the moment someone answers.` : `We'll email you the moment someone answers.`),
    footerHtml: `Questions? Reply to this email.`,
    postalAddress: a.postalAddress,
  });
  return { subject: `Sent! ${a.schools.length === 1 ? a.schools[0]!.school : `${a.schools.length} schools`} — we'll tell you when they answer`, html, text: `Your message about ${a.athlete} is on its way to ${a.schools.map((s) => s.school).join(", ")}.${free ? "" : " Only charged for schools that answer."}\n${a.postalAddress}` };
}

/** Gmail railway — first-time sender: confirm + add a card once. */
export function draftConfirmFirstTime(a: { school: string; priceCents: number; confirmUrl: string; postalAddress: string }): Rendered {
  const html = layout({
    preheader: `One tap to send your message to ${a.school}.`,
    heading: `Got it — one tap to send to ${a.school}`,
    bodyHtml:
      p(`We received your message for the <strong>${esc(a.school)}</strong> coaching staff. Tap below to add your athlete's details and confirm${a.priceCents > 0 ? ` — <strong>${money(a.priceCents)}, charged only if a coach answers</strong>` : ""}.`) +
      p(`<span style="font-size:13px;color:${MUTED};">Next time it's even easier: email any school and just reply YES.</span>`),
    cta: { label: "Confirm & send", url: a.confirmUrl },
    postalAddress: a.postalAddress,
  });
  return { subject: `Confirm: your message to ${a.school}`, html, text: `Confirm and send your message to ${a.school}${a.priceCents > 0 ? ` (${money(a.priceCents)}, only if answered)` : ""}: ${a.confirmUrl}\n${a.postalAddress}` };
}

/** Gmail railway — returning sender: reply YES to send (card on file). */
export function draftConfirmYes(a: { school: string; priceCents: number; athlete: string; postalAddress: string }): Rendered {
  const html = layout({
    preheader: `Reply YES to send to ${a.school}.`,
    heading: `Reply YES to send`,
    bodyHtml:
      p(`Ready to send your message about <strong>${esc(a.athlete)}</strong> to the <strong>${esc(a.school)}</strong> coaching staff.`) +
      p(a.priceCents > 0 ? `<strong>Just reply YES.</strong> We'll place a ${money(a.priceCents)} hold on your saved card — charged only if a coach answers.` : `<strong>Just reply YES</strong> and we'll send it.`),
    postalAddress: a.postalAddress,
  });
  return { subject: `Reply YES to send to ${a.school}`, html, text: `Reply YES to send your message about ${a.athlete} to ${a.school}${a.priceCents > 0 ? ` (${money(a.priceCents)} hold, only charged if answered)` : ""}.\n${a.postalAddress}` };
}

export const lineSms = {
  coachAsk: (req: EvalRequest, url: string, earnCents: number, bonusHours?: number) =>
    `The Athlete Market: ${req.athlete_name} (${req.grad_year} ${req.position}) asked about your program${earnCents > 0 ? ` — earn ${money(earnCents)} for answering${bonusHours ? ` within ${bonusHours}h` : ""}` : ""}. Answer in one tap: ${url} Reply STOP to opt out.`,
  parentSent: (n: number, school: string, free = false) =>
    `The Athlete Market: your message is on its way to ${n === 1 ? school : `${n} schools`}. We'll text you the moment a coach answers.${free ? "" : " You're only charged if they do."} Reply STOP to opt out.`,
  parentOpened: (coachName: string) => `The Athlete Market: ${coachName} just opened your message 👀`,
  parentEscalated: (school: string, nextName: string, free = false) => `The Athlete Market: no answer yet from ${school} — we've also sent your message to ${nextName}.${free ? "" : " Still only charged if someone answers."}`,
  parentAnswered: (coachName: string, school: string, summary: string) =>
    `The Athlete Market: ${coachName}${school ? ` (${school})` : ""} answered! ${summary} Full details in your email. Reply to this text to respond.`,
  relayToParent: (coachName: string, body: string) => `${coachName}: ${body.slice(0, 280)}${body.length > 280 ? "…" : ""} (reply here to respond)`,
};
