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
    ? `<div style="margin:0 0 14px;padding:14px 16px;background:#0B1B3F;border-radius:12px;color:#fff;"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8FB0FF;">Level ${esc(coach.full_name.split(" ")[0])} sees ${esc(first)} at</div><div style="font-size:20px;font-weight:700;margin-top:4px;">${esc(req.level_read)}</div></div>`
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
        ? `No one on the ${esc(req.target_school ?? coach.school ?? "")} staff answered in time.`
        : `We couldn't reach the ${esc(req.target_school ?? coach.school ?? "")} staff.`)
    : a.why === "declined"
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

/* ═════════════════════════════ Coach Line ═════════════════════════════ */

const ANSWER_BUTTONS: { kind: string; label: string; sub: string }[] = [
  { kind: "camp", label: "🏕️ Invite to camp", sub: "Your saved camp dates are filled in" },
  { kind: "event", label: "📍 We'll be at an event", sub: "Tournament / showcase you'll attend" },
  { kind: "film", label: "🎥 Send more film", sub: "Ask for a full game or more clips" },
  { kind: "update", label: "📅 Keep me updated", sub: "Check back after the season" },
  { kind: "level", label: "↪️ Better fit at another level", sub: "Point them to D2 / D3 / NAIA / JUCO" },
  { kind: "personal", label: "✍️ Write a personal reply", sub: "A sentence or two in your words" },
];

export function coachAskInvite(a: {
  req: EvalRequest; coach: Coach; answerUrl: (kind?: string) => string; declineUrl: string; unsubscribeUrl: string; hubUrl: string;
  postalAddress: string; earnCents: number; escalated?: boolean; reminder?: { daysLeft: number; nudge?: boolean };
}): Rendered {
  const { req, coach } = a;
  const who = `${req.athlete_name} (${req.grad_year} ${req.position})`;
  const earn = a.earnCents > 0 ? ` · ${money(a.earnCents)} for answering` : "";
  const subject = a.reminder?.nudge
    ? `${req.athlete_name} is still waiting on your answer${earn}`
    : a.reminder
    ? `${a.reminder.daysLeft} day${a.reminder.daysLeft === 1 ? "" : "s"} left to answer ${req.athlete_name}${earn}`
    : `${who} asked about ${req.target_school ?? "your program"} — answer in one tap${earn}`;
  const buttons = ANSWER_BUTTONS.map(
    (b) => `<tr><td style="padding:0 0 8px;"><a href="${esc(a.answerUrl(b.kind))}" style="display:block;padding:12px 14px;border:1px solid #DCE6FF;border-radius:12px;background:#F6F9FF;text-decoration:none;color:${NAVY};"><span style="font-size:15px;font-weight:700;">${b.label}</span><br><span style="font-size:12.5px;color:${MUTED};">${b.sub}</span></a></td></tr>`,
  ).join("");
  const html = layout({
    preheader: `“${(req.message ?? "").slice(0, 90)}…” — answer in one tap from your phone.`,
    heading: a.escalated ? `${req.athlete_name} is hoping to hear from your staff` : `A recruit asked about your program`,
    bodyHtml:
      table([
        row("Athlete", `${esc(req.athlete_name)} · ${esc(req.position)} · Class of ${esc(req.grad_year)}`),
        row("Sport", esc(req.sport)),
        row("Film", `<a href="${esc(req.film_url)}" style="color:${BLUE};">Watch film ↗</a>`),
        ...(a.earnCents > 0 ? [row("You earn", `<span style="color:#0A7A3E;">${money(a.earnCents)} when you answer</span>`)] : []),
        row("Answer by", esc(dateOnly(req.expires_at))),
      ]) +
      `<div style="margin:14px 0;padding:14px 16px;border-left:3px solid ${BLUE};background:#F4F6FB;border-radius:0 12px 12px 0;font-size:15px;line-height:1.6;color:${NAVY};white-space:pre-wrap;">${esc(req.message ?? "")}</div>` +
      p(`<strong>Answer in one tap:</strong>`) +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${buttons}</table>` +
      p(`<span style="font-size:13px;color:${MUTED};">On your phone? You can also just <strong>hit Reply</strong> and type <strong>CAMP</strong>, <strong>EVENT</strong>, <strong>FILM</strong>, <strong>UPDATE</strong>, <strong>LEVEL D2</strong> — or any message. Your email address is never shown to the family.</span>`) +
      (!coach.camps?.length ? p(`<span style="font-size:13px;color:${MUTED};">Tip: <a href="${esc(a.hubUrl)}" style="color:${BLUE};">save your camp dates once</a> and every camp invite fills itself in.</span>`) : ""),
    footerHtml: `Sent through The Athlete Market Coach Line. Not for you? <a href="${esc(a.declineUrl)}" style="color:${MUTED};">Pass on this one</a> · <a href="${esc(a.hubUrl)}" style="color:${MUTED};">Pause messages</a> · <a href="${esc(a.unsubscribeUrl)}" style="color:${MUTED};">Never email me again</a>.`,
    postalAddress: a.postalAddress,
  });
  const text = [subject, "", req.message ?? "", "", `Film: ${req.film_url}`, "",
    ...ANSWER_BUTTONS.map((b) => `${b.label.replace(/^\S+\s/, "")}: ${a.answerUrl(b.kind)}`), "",
    "Or hit Reply and type CAMP / EVENT / FILM / UPDATE / LEVEL D2 / any message.", `Pass: ${a.declineUrl}`, `Stop emails: ${a.unsubscribeUrl}`, a.postalAddress].join("\n");
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

export function parentAnswer(a: {
  req: EvalRequest; coach: Coach; postalAddress: string; askAnotherUrl?: string; replyHint: boolean;
}): Rendered {
  const { req, coach } = a;
  const school = coach.school ?? req.target_school ?? "the program";
  const subject = `${coach.full_name} (${school}) answered ${req.athlete_name.split(" ")[0]} 🎉`;
  const html = layout({
    preheader: `${coach.full_name} answered your message about ${req.athlete_name}.`,
    heading: `${coach.full_name} answered`,
    bodyHtml:
      p(`<span style="color:${MUTED};">${esc([coach.title, school].filter(Boolean).join(" · "))}</span>`) +
      answerCardHtml(req, coach) +
      p(`<strong>Want to respond?</strong> Just reply to this email (or text us back if you got a text) — we'll pass it straight to ${esc(coach.full_name.split(" ")[0])}. Follow-ups are free.`) +
      p(`<span style="font-size:13px;color:${MUTED};">Your email and phone stay private — every message goes through The Athlete Market.</span>`),
    cta: a.askAnotherUrl ? { label: "Ask another school", url: a.askAnotherUrl } : undefined,
    footerHtml: `Reference ${esc(req.ref)}. Ask any college coach at theathletemarket.com — answered or it's free.`,
    postalAddress: a.postalAddress,
  });
  const pl = (req.answer_payload ?? {}) as Record<string, string>;
  const text = [`${coach.full_name} (${school}) answered about ${req.athlete_name}.`, "",
    req.answer_kind === "camp" ? `Camp: ${pl.name} — ${pl.dates}${pl.location ? `, ${pl.location}` : ""}${pl.url ? `\nRegister: ${pl.url}` : ""}` : "",
    req.answer_kind === "event" ? `They'll be at: ${pl.name} — ${pl.dates}${pl.location ? `, ${pl.location}` : ""}` : "",
    req.answer_kind === "film" ? "They'd like more film — reply with a link." : "",
    req.answer_kind === "update" ? "Keep them updated — reply when you have new film or results." : "",
    req.answer_kind === "level" ? `Better fit: ${pl.level}` : "",
    pl.note ?? "", "", "Reply to this email to respond — we'll pass it on.", a.postalAddress].filter((l) => l !== "").join("\n");
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

export function orderReceipt(a: { email: string; name: string; athlete: string; schools: { school: string; price: number }[]; postalAddress: string }): Rendered {
  const rows = a.schools.map((s) => row(esc(s.school), `${money(s.price)} <span style="font-weight:400;color:${MUTED};">hold</span>`));
  const html = layout({
    preheader: "Your message is on its way. You're only charged for schools that answer.",
    heading: "Your message is on its way",
    bodyHtml:
      p(`We're delivering your message about <strong>${esc(a.athlete)}</strong> to ${a.schools.length === 1 ? "this coaching staff" : `these ${a.schools.length} coaching staffs`}:`) +
      table(rows) +
      p(`<strong>Answered — or it's free.</strong> Each school is charged only if a coach there answers. If the first coach doesn't, we automatically reach the next person on that staff. No answer in 5 days? That hold is released.`) +
      p(`We'll text and email you the moment someone answers.`),
    footerHtml: `Questions? Reply to this email.`,
    postalAddress: a.postalAddress,
  });
  return { subject: `Sent! ${a.schools.length === 1 ? a.schools[0]!.school : `${a.schools.length} schools`} — we'll tell you when they answer`, html, text: `Your message about ${a.athlete} is on its way to ${a.schools.map((s) => s.school).join(", ")}. Only charged for schools that answer.\n${a.postalAddress}` };
}

/** Gmail railway — first-time sender: confirm + add a card once. */
export function draftConfirmFirstTime(a: { school: string; priceCents: number; confirmUrl: string; postalAddress: string }): Rendered {
  const html = layout({
    preheader: `One tap to send your message to ${a.school}.`,
    heading: `Got it — one tap to send to ${a.school}`,
    bodyHtml:
      p(`We received your message for the <strong>${esc(a.school)}</strong> coaching staff. Tap below to add your athlete's details and confirm — <strong>${money(a.priceCents)}, charged only if a coach answers</strong>.`) +
      p(`<span style="font-size:13px;color:${MUTED};">Next time it's even easier: email any school and just reply YES.</span>`),
    cta: { label: "Confirm & send", url: a.confirmUrl },
    postalAddress: a.postalAddress,
  });
  return { subject: `Confirm: your message to ${a.school}`, html, text: `Confirm and send your message to ${a.school} (${money(a.priceCents)}, only if answered): ${a.confirmUrl}\n${a.postalAddress}` };
}

/** Gmail railway — returning sender: reply YES to send (card on file). */
export function draftConfirmYes(a: { school: string; priceCents: number; athlete: string; postalAddress: string }): Rendered {
  const html = layout({
    preheader: `Reply YES to send to ${a.school}.`,
    heading: `Reply YES to send`,
    bodyHtml:
      p(`Ready to send your message about <strong>${esc(a.athlete)}</strong> to the <strong>${esc(a.school)}</strong> coaching staff.`) +
      p(`<strong>Just reply YES.</strong> We'll place a ${money(a.priceCents)} hold on your saved card — charged only if a coach answers.`),
    postalAddress: a.postalAddress,
  });
  return { subject: `Reply YES to send to ${a.school}`, html, text: `Reply YES to send your message about ${a.athlete} to ${a.school} (${money(a.priceCents)} hold, only charged if answered).\n${a.postalAddress}` };
}

export const lineSms = {
  coachAsk: (req: EvalRequest, url: string, earnCents: number) =>
    `The Athlete Market: ${req.athlete_name} (${req.grad_year} ${req.position}) asked about your program${earnCents > 0 ? ` — ${money(earnCents)} for answering` : ""}. Answer in one tap: ${url} Reply STOP to opt out.`,
  parentSent: (n: number, school: string) =>
    `The Athlete Market: your message is on its way to ${n === 1 ? school : `${n} schools`}. We'll text you the moment a coach answers. You're only charged if they do. Reply STOP to opt out.`,
  parentOpened: (coachName: string) => `The Athlete Market: ${coachName} just opened your message 👀`,
  parentEscalated: (school: string, nextName: string) => `The Athlete Market: no answer yet from ${school} — we've also sent your message to ${nextName}. Still only charged if someone answers.`,
  parentAnswered: (coachName: string, school: string, summary: string) =>
    `The Athlete Market: ${coachName} (${school}) answered! ${summary} Full details in your email. Reply to this text to respond.`,
  relayToParent: (coachName: string, body: string) => `${coachName}: ${body.slice(0, 280)}${body.length > 280 ? "…" : ""} (reply here to respond)`,
};
