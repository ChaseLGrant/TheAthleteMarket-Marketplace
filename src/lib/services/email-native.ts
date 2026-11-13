import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Deps } from "../deps";
import { env } from "../env";
import { VIDEO_MAX_BYTES } from "../constants";
import { coachReplyNeedsMore, sms as smsText } from "../email/templates";
import { log } from "../log";
import type { EvalFormat, EvalRequest } from "../types";
import { adminRequestUrl, coachReviewUrl } from "./links";
import { alertAdmin, sendEmail } from "./notify";
import { capturePayment, completeRequest, declineRequest, UserFacingError } from "./lifecycle";

/* ────────────────────────────────────────────────────────────────────────────
 * Email-native flow. Each request gets its own reply-to address:
 *     r-<request id hex>-<signature>@reply.theathletemarket.com
 * The coach just hits Reply in their own inbox. An inbound-email webhook (Postmark) delivers the
 * reply here; we clean it up, check it's a real answer, charge the card, forward it to the parent
 * and pay the coach.
 * ──────────────────────────────────────────────────────────────────────────── */

export const inboundDomain = () => process.env.INBOUND_EMAIL_DOMAIN?.trim() || "reply.theathletemarket.com";

function sig(id: string, nonce: string) {
  // lowercase hex only: some mail systems lowercase local parts
  return createHmac("sha256", env.appSecret()).update(`reply:${id}:${nonce}`).digest("hex").slice(0, 12);
}

export function replyAddress(req: Pick<EvalRequest, "id" | "coach_link_nonce">): string {
  return `r-${req.id.replace(/-/g, "")}-${sig(req.id, req.coach_link_nonce)}@${inboundDomain()}`;
}

/** Returns the request id if the address is one of ours and the signature is valid. */
export async function resolveReplyAddress(deps: Deps, addresses: string[]): Promise<EvalRequest | null> {
  for (const raw of addresses) {
    const m = raw.toLowerCase().match(/r-([0-9a-f]{32})-([0-9a-f]{12})@/);
    if (!m) continue;
    const h = m[1]!;
    const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    const req = await deps.store.getRequest(id);
    if (!req) continue;
    const a = Buffer.from(m[2]!), b = Buffer.from(sig(req.id, req.coach_link_nonce));
    if (a.length === b.length && timingSafeEqual(a, b)) return req;
  }
  return null;
}

/** The fill-in template coaches reply with. Also used to pre-fill the "Reply now" mailto link. */
export function replyTemplate(format: EvalFormat): string {
  const lines = [
    "Level I see you at (D1 / D2 / D3 / NAIA / JUCO / Not yet): ",
    "Top strength: ",
    "What to work on: ",
    "Next step: ",
  ];
  if (format === "voice") lines.push("", "(Attach your voice memo — iPhone: Voice Memos → ••• → Share → Mail)");
  if (format === "video") lines.push("", "(Attach your video or paste a link — or use the Record link in our email)");
  return lines.join("\n");
}

export function mailtoReply(req: EvalRequest): string {
  const subject = `Re: ${req.athlete_name} — ${req.format === "written" ? "written take" : req.format === "voice" ? "voice note" : "video breakdown"} (${req.ref})`;
  return `mailto:${replyAddress(req)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(replyTemplate(req.format))}`;
}

/** Remove quoted history, signatures and mobile footers from a reply. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^On .+wrote:?$/i.test(t) || /^On .+(AM|PM|\d{4}),?$/i.test(t)) break; // Gmail / Apple Mail (may wrap)
    if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(t) || /^_{5,}$/.test(t)) break; // Outlook
    if (/^From:\s.+/i.test(t) && out.length > 0) break;
    if (/^>/.test(t)) continue;
    if (/^(--|—)\s*$/.test(t)) break; // signature delimiter
    if (/^Sent from my (iPhone|iPad|Android|Galaxy|mobile)/i.test(t) || /^Get Outlook for/i.test(t)) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export interface ParsedReply {
  level: string | null;
  strength: string | null;
  improve: string | null;
  next: string | null;
  body: string; // full cleaned reply
  wordCount: number;
  isDecline: boolean;
  links: string[];
}

export function parseCoachReply(raw: string): ParsedReply {
  const body = stripQuoted(raw).replace(/\(Attach your [^)]*\)/gi, "").trim();
  const grab = (re: RegExp) => {
    const m = body.match(re);
    const v = m?.[1]?.trim();
    return v && v.length > 0 && !/^[-–:]*$/.test(v) ? v.slice(0, 600) : null;
  };
  const level = grab(/level[^:\n]*:\s*(.+)/i);
  const strength = grab(/top strength\s*:\s*(.+)/i);
  const improve = grab(/(?:what to )?work on\s*:\s*(.+)/i);
  const next = grab(/next step\s*:\s*(.+)/i);
  const words = body.replace(/^.*?:\s*$/gm, "").split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  // Display version: drop the level line (shown separately) and the "(D1 / D2 / …)" hint; drop empty template lines.
  const display = body
    .split("\n")
    .filter((l) => !(level && /^\s*level[^:\n]*:/i.test(l)))
    .map((l) => l.replace(/\s*\((?:D1|NAIA)[^)]*\)/i, ""))
    .filter((l) => !/^\s*(top strength|what to work on|work on|next step)\s*:\s*$/i.test(l))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const isDecline = /^\s*(pass|decline|no thanks|not interested|can'?t do (this|it)|no)\s*[.!]?\s*$/i.test(body.split("\n")[0] ?? "") && words.length <= 12;
  const links = [...body.matchAll(/https:\/\/[^\s<>()"']+/gi)].map((m) => m[0]!.replace(/[.,;]+$/, ""));
  return { level, strength, improve, next, body: display, wordCount: words.length, isDecline, links };
}

export interface InboundAttachment { name: string; contentType: string; contentBase64: string; size: number }
export interface InboundEmail {
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  strippedReply?: string | null;
  attachments: InboundAttachment[];
}

const AUDIO = /^audio\/|\.(m4a|mp3|aac|wav|amr|caf|ogg|opus|3gp)$/i;
const VIDEO = /^video\/|\.(mp4|mov|m4v|webm|3gp)$/i;
const isAudio = (a: InboundAttachment) => AUDIO.test(a.contentType) || AUDIO.test(a.name);
const isVideo = (a: InboundAttachment) => VIDEO.test(a.contentType) || VIDEO.test(a.name);
const MIN_WORDS = 25;

/**
 * Process one inbound reply. Safe to receive the same message twice (claimed by message id).
 * Outcomes: accepted | too_short | needs_media | declined | closed | unknown_address | duplicate
 */
export async function handleInboundEmail(deps: Deps, msg: InboundEmail): Promise<string> {
  // Coach Line addresses: parent thread replies, Gmail "YES", and school / coach addresses.
  const line = await import("./line");
  const target = await line.resolveLineAddress(deps, msg.to);
  if (target) {
    if (!(await deps.store.claimInbound(msg.messageId, target.kind === "parent_thread" ? target.req.id : null, msg.from))) return "duplicate";
    const body = stripQuoted(msg.strippedReply?.trim() ? msg.strippedReply : msg.text);
    let outcome: string;
    if (target.kind === "parent_thread") outcome = body ? await line.relayToCoach(deps, target.req, body.slice(0, 4000), "email") : "empty";
    else if (target.kind === "draft") outcome = await line.confirmDraftByEmail(deps, target.draft, body);
    else outcome = body.length >= 10 ? await line.handleParentEmail(deps, { from: msg.from, subject: msg.subject, body, target }) : "too_short";
    await deps.store.setInboundOutcome(msg.messageId, outcome).catch(() => {});
    return outcome;
  }
  const req = await resolveReplyAddress(deps, msg.to);
  if (!(await deps.store.claimInbound(msg.messageId, req?.id ?? null, msg.from))) return "duplicate";
  try {
    return await processInbound(deps, msg, req);
  } catch (e) {
    // Mark as error so the provider's automatic retry can reprocess it (never lose a coach's reply).
    await deps.store.setInboundOutcome(msg.messageId, "error").catch(() => {});
    throw e;
  }
}

async function processInbound(deps: Deps, msg: InboundEmail, req: EvalRequest | null): Promise<string> {
  const done = async (o: string) => { await deps.store.setInboundOutcome(msg.messageId, o).catch(() => {}); return o; };
  if (req?.format === "ask") return done(await processAskReply(deps, msg, req));
  if (!req) return done("unknown_address");

  const coach = (await deps.store.getCoach(req.coach_id))!;
  const open = ["paid", "coach_notified", "accepted"].includes(req.status) && !!req.expires_at && Date.parse(req.expires_at) > deps.now().getTime();
  const parsed = parseCoachReply(msg.strippedReply?.trim() ? msg.strippedReply : msg.text);
  const autoReply = async (kind: "too_short" | "needs_media" | "closed", key: string) => {
    await sendEmail(deps, {
      to: msg.from,
      rendered: coachReplyNeedsMore({ req, coach, kind, recordUrl: coachReviewUrl(req), template: replyTemplate(req.format), postalAddress: env.postalAddress() }),
      template: `coach_autoreply_${kind}`,
      idempotencyKey: `autoreply-${msg.messageId}-${key}`,
      requestId: req.id,
      coachId: coach.id,
      replyTo: replyAddress(req),
    }).catch((e) => log("warn", "auto-reply failed", { error: String(e) }));
  };

  if (!open) {
    if (!["submitted", "completed"].includes(req.status)) await autoReply("closed", "closed");
    return done("closed");
  }
  if (parsed.isDecline) {
    await declineRequest(deps, req, "Coach replied to decline", "coach");
    return done("declined");
  }

  // Pick the best piece of media for the format.
  const media =
    req.format === "voice" ? msg.attachments.find(isAudio) ?? msg.attachments.find(isVideo)
    : req.format === "video" ? msg.attachments.find(isVideo) ?? msg.attachments.find(isAudio)
    : msg.attachments.find(isVideo) ?? msg.attachments.find(isAudio);
  const videoLink = parsed.links.find((l) => /youtu|vimeo|loom\.com|drive\.google|hudl|icloud\.com|dropbox/i.test(l)) ?? null;

  if (req.format === "written" && !media && parsed.wordCount < MIN_WORDS && ![parsed.strength, parsed.improve, parsed.next].filter(Boolean).length) {
    await autoReply("too_short", "short");
    return done("too_short");
  }
  if (req.format !== "written" && !media && !videoLink) {
    // Generous fallback: a substantial written reply to a voice request is still accepted.
    if (!(req.format === "voice" && parsed.wordCount >= 80)) {
      await autoReply("needs_media", "media");
      return done("needs_media");
    }
  }

  let path: string | null = null, mime: string | null = null, size: number | null = null;
  if (media) {
    const data = Buffer.from(media.contentBase64, "base64");
    if (data.length > VIDEO_MAX_BYTES) throw new UserFacingError("Attachment too large");
    const ext = (media.name.match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? (isAudio(media) ? "m4a" : "mp4")).toLowerCase();
    path = `requests/${req.id}/reply-${randomUUID()}.${ext}`;
    mime = media.contentType || (isAudio(media) ? "audio/mp4" : "video/mp4");
    const { url } = await deps.storage.createUploadUrl(path);
    await putBytes(deps, url, data, mime);
    size = data.length;
  }

  const kind = media ? (isAudio(media) ? "voice" : "video") : videoLink && req.format !== "written" ? "link" : "written";
  const result = await submitResponse(deps, req, {
    kind, text: parsed.body, level: parsed.level, strength: parsed.strength, improve: parsed.improve, next: parsed.next,
    path, mime, size, link: kind === "link" ? videoLink : null, from: msg.from,
  });
  return done(result ? "accepted" : "closed");
}

/** Upload bytes to a signed URL (works for Supabase Storage and the demo store). */
async function putBytes(deps: Deps, url: string, data: Buffer, mime: string) {
  const fake = (deps.storage as unknown as { files?: Map<string, { data: Buffer; mime: string }> }).files;
  if (fake && url.startsWith("/api/demo/storage")) {
    const path = new URL(url, "http://x").searchParams.get("path")!;
    fake.set(path, { data, mime });
    return;
  }
  const res = await fetch(url, { method: "PUT", headers: { "Content-Type": mime, "x-upsert": "true" }, body: new Uint8Array(data) });
  if (!res.ok) throw new Error(`storage upload failed: ${res.status}`);
}

/** Record the coach's response, charge the card, deliver to the parent, pay the coach. */
export async function submitResponse(
  deps: Deps,
  req: EvalRequest,
  a: {
    kind: "written" | "voice" | "video" | "link"; text: string; level: string | null; strength: string | null; improve: string | null;
    next: string | null; path: string | null; mime: string | null; size: number | null; link: string | null; from: string | null;
  },
): Promise<EvalRequest | null> {
  const now = deps.now().toISOString();
  const r = await deps.store.casRequest(
    req.id,
    { status: ["paid", "coach_notified", "accepted"], expiresAfter: now },
    {
      status: "submitted", submitted_at: now, accepted_at: req.accepted_at ?? now, coach_viewed_at: req.coach_viewed_at ?? now,
      response_kind: a.kind, response_text: a.text.slice(0, 8000) || null, response_link: a.link, response_from: a.from,
      level_read: a.level, takeaway_strength: a.strength, takeaway_improve: a.improve, takeaway_next: a.next,
      video_path: a.path, video_mime: a.mime, video_size_bytes: a.size, film_issue_at: null,
    },
  );
  if (!r) {
    if (a.path) await deps.storage.remove(a.path).catch(() => {});
    return null;
  }
  await deps.store.addEvent({ request_id: r.id, type: "reply_received", actor: "coach", from_status: req.status, to_status: "submitted", data: { kind: a.kind, words: a.text.split(/\s+/).length } });
  if (!(await capturePayment(deps, r.id))) return deps.store.getRequest(r.id);
  const settings = await deps.store.getSettings();
  if (settings.require_admin_review) {
    await alertAdmin(deps, "Reply awaiting review", [`${r.ref} — review before delivery.`], adminRequestUrl(r.id));
    return deps.store.getRequest(r.id);
  }
  return completeRequest(deps, r.id, "coach");
}

/** Text the parent at key moments (only if they opted in at checkout). */
export async function textParent(deps: Deps, req: EvalRequest, kind: "sent" | "replied" | "released", extraUrl?: string) {
  if (!req.purchaser_phone || !req.purchaser_sms_opt_in_at) return;
  const coach = await deps.store.getCoach(req.coach_id);
  const name = coach?.full_name ?? "The coach";
  const body =
    kind === "sent" ? smsText.parentSent(req, name)
    : kind === "replied" ? smsText.parentReplied(req, name)
    : smsText.parentReleased(req, name, extraUrl ?? "");
  const { sendSms } = await import("./notify");
  await sendSms(deps, { to: req.purchaser_phone, body, template: `parent_${kind}`, dedupeKey: `parent-sms-${kind}-${req.id}`, requestId: req.id });
}

/** A coach replied by email to a Coach Line message: keyword / free-text answer, PASS, or a thread follow-up. */
async function processAskReply(deps: Deps, msg: InboundEmail, req: EvalRequest): Promise<string> {
  const line = await import("./line");
  const body = stripQuoted(msg.strippedReply?.trim() ? msg.strippedReply : msg.text);
  if (req.status === "completed") return body ? line.relayToParent(deps, req, body.slice(0, 4000), "email") : "empty";
  const open = ["paid", "coach_notified", "accepted"].includes(req.status) && !!req.expires_at && Date.parse(req.expires_at) > deps.now().getTime();
  if (!open) return "closed";
  // Credit whichever coach on the staff chain actually replied.
  const chain = await Promise.all(req.escalation_ids.map((id) => deps.store.getCoach(id)));
  const coach = chain.find((c) => c?.email && c.email.toLowerCase() === msg.from.toLowerCase()) ?? (await deps.store.getCoach(req.coach_id))!;
  const parsed = line.parseAskReply(body);
  if (!parsed) return "empty";
  // On a staff chain, a pass from one coach moves it to the next instead of ending it.
  if (parsed === "pass") return line.passAsk(deps, req, coach);
  if ((parsed.kind === "camp" && !coach.camps?.length) || (parsed.kind === "event" && !coach.events?.length)) {
    // Keyword without saved details → treat the rest as a personal note if there is one; else ask them to tap.
    if (parsed.note && parsed.note.length > 10) { parsed.kind = "personal"; }
    else {
      await sendEmail(deps, {
        to: msg.from,
        rendered: coachReplyNeedsMore({ req, coach, kind: "needs_media", recordUrl: line.answerUrl(req, coach, parsed.kind), template: "", postalAddress: env.postalAddress() }),
        template: "ask_needs_details", idempotencyKey: `ask-details-${msg.messageId}`, requestId: req.id, coachId: coach.id,
      }).catch(() => {});
      return "needs_details";
    }
  }
  try {
    await line.submitAnswer(deps, req, coach, parsed);
    return "accepted";
  } catch (e) {
    if (e instanceof UserFacingError) return "closed";
    throw e;
  }
}
