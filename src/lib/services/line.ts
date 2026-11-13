import { createHmac, timingSafeEqual } from "node:crypto";
import type { Deps } from "../deps";
import { env } from "../env";
import { paidRequestGate } from "../compliance";
import {
  coachAskInvite, draftConfirmFirstTime, draftConfirmYes, lineSms, orderReceipt, relayMessage,
} from "../email/templates";
import { slugify } from "../format";
import { log } from "../log";
import { toE164 } from "../phone";
import { priceBreakdown } from "../pricing";
import { makeToken, randomRef, tokenId, verifyToken } from "../tokens";
import type { AnswerKind, AskDraft, CampItem, Coach, EvalRequest, EventItem } from "../types";
import { inboundDomain } from "./email-native";
import { coachDeclineUrl, hubUrl, secondOpinionUrl, unsubscribeUrl } from "./links";
import { capturePayment, completeRequest, refundRequest, UserFacingError } from "./lifecycle";
import { alertAdmin, sendEmail, sendSms } from "./notify";

/* ══════════════════════════════════════════════════════════════════════════════
 * COACH LINE — "Ask any college coach. Answered, or it's free."
 *   Parent asks a school's staff (or one coach) → one hold per school → message goes to the
 *   most likely responder → escalates through the staff every N hours → first answer wins →
 *   card charged, parent gets the answer (email + text), coach gets their share → the thread
 *   stays open both ways (email + SMS) with The Athlete Market relaying every message.
 * ══════════════════════════════════════════════════════════════════════════════ */

const iso = (d: Date) => d.toISOString();
const MAX_CHAIN = 3;
const MAX_THREAD = 40;

/** Who on a staff is most likely to answer recruiting messages first. Lower = earlier. */
export function staffRank(title: string | null): number {
  const t = (title ?? "").toLowerCase();
  if (/recruit/.test(t)) return 0;
  if (/director of (player|personnel|operations)|ops/.test(t)) return 1;
  if (/assistant|associate|grad(uate)? assistant|\bga\b/.test(t)) return 1;
  if (/head coach/.test(t)) return 3;
  return 2;
}

export async function buildChain(deps: Deps, a: { coach?: Coach | null; school?: string | null; sport?: string | null }): Promise<Coach[]> {
  const settings = await deps.store.getSettings();
  const school = a.coach?.school ?? a.school ?? null;
  const sport = a.coach?.sport ?? a.sport ?? null;
  const staff = school && sport ? await deps.store.listStaff(school, sport) : [];
  const usable = async (c: Coach) => paidRequestGate(c, settings).ok && !!c.email && !(await deps.store.isSuppressed(c.email));
  const out: Coach[] = [];
  if (a.coach && (await usable(a.coach))) out.push(a.coach);
  const rest = staff.filter((c) => c.id !== a.coach?.id).sort((x, y) => staffRank(x.title) - staffRank(y.title) || x.full_name.localeCompare(y.full_name));
  for (const c of rest) if (out.length < MAX_CHAIN && (await usable(c))) out.push(c);
  return out;
}

export { askPricing } from "../ask-pricing";
import { askPricing } from "../ask-pricing";

export interface AskTarget { coachSlug?: string | null; school?: string | null; sport?: string | null }
export interface AskInput {
  targets: AskTarget[];
  message: string;
  athleteName: string;
  gradYear: number;
  position: string;
  sport: string;
  filmUrl: string;
  purchaserName: string;
  purchaserEmail: string;
  purchaserPhone: string | null;
  parentSmsConsent: boolean;
  athleteIsMinor: boolean;
  relationship: "parent_guardian" | "athlete_adult";
  draftId?: string | null;
}

/** Create one request per school + one Stripe setup checkout (card saved; holds placed after). */
export async function createAskOrder(deps: Deps, input: AskInput, ctx: { ip: string }): Promise<{ url: string; orderId: string }> {
  const { store } = deps;
  if (!(await store.rateLimit(`ask:ip:${ctx.ip}`, 3600, 40))) throw new UserFacingError("Too many requests from this network. Try again in an hour.", "rate_limited");
  if (!input.targets.length || input.targets.length > 5) throw new UserFacingError("Choose 1 to 5 schools.");
  const settings = await store.getSettings();

  const chains: { chain: Coach[]; school: string; sport: string }[] = [];
  for (const t of input.targets) {
    const coach = t.coachSlug ? await store.getCoachBySlug(t.coachSlug) : null;
    const chain = await buildChain(deps, { coach, school: t.school, sport: t.sport ?? input.sport });
    if (!chain.length) throw new UserFacingError(`We can't reach anyone at ${coach?.school ?? t.school ?? "that school"} right now. Try another school.`);
    const school = coach?.school ?? t.school ?? chain[0]!.school ?? "the program";
    if (chains.some((c) => c.school === school && c.sport === chain[0]!.sport)) continue; // duplicate school
    chains.push({ chain, school, sport: chain[0]!.sport });
  }
  const pricing = askPricing(settings.ask_prices, chains.length);
  const now = deps.now();
  const phone = toE164(input.purchaserPhone);
  const order = await store.insertOrder({
    ref: randomRef(), stripe_checkout_session_id: null, purchaser_email: input.purchaserEmail, total_cents: pricing.total, school_count: chains.length,
  });

  for (let i = 0; i < chains.length; i++) {
    const { chain, school, sport } = chains[i]!;
    const price = pricing.each[i]!;
    const pb = priceBreakdown(price, { commission_bps: 10_000 - settings.ask_coach_share_bps });
    const req = await store.insertRequest({
      ref: randomRef(), coach_id: chain[0]!.id, athlete_name: input.athleteName, sport, position: input.position, grad_year: input.gradYear,
      film_url: input.filmUrl, athlete_email: null, metrics: null, gpa: null, message: input.message, athlete_is_minor: input.athleteIsMinor,
      purchaser_name: input.purchaserName, purchaser_email: input.purchaserEmail, purchaser_relationship: input.relationship,
      guardian_consent_at: input.athleteIsMinor ? iso(now) : null, terms_accepted_at: iso(now), currency: "usd",
      price_cents: pb.price_cents, platform_fee_cents: pb.platform_fee_cents, coach_payout_cents: pb.coach_payout_cents,
      utm_source: null, utm_campaign: null, parent_request_id: null, format: "ask",
      target_school: school, target_sport: sport, escalation_ids: chain.map((c) => c.id), order_id: order.id,
      purchaser_phone: phone, purchaser_sms_opt_in_at: phone && input.parentSmsConsent ? iso(now) : null,
    });
    await store.addEvent({ request_id: req.id, type: "ask_created", actor: "purchaser", from_status: null, to_status: "awaiting_payment", data: { school, chain: chain.map((c) => c.full_name) } });
    await store.track("checkout_started", chain[0]!.id, req.id).catch(() => {});
  }
  if (input.draftId) await store.updateDraft(input.draftId, { status: "sent" });

  const site = env.siteUrl();
  const session = await deps.payments.createSetupCheckout({
    orderId: order.id, ref: order.ref, customerEmail: input.purchaserEmail, customerName: input.purchaserName,
    description: `Coach Line: ${chains.map((c) => c.school).join(", ")}`,
    successUrl: `${site}/ask/sent?order=${order.ref}`, cancelUrl: `${site}/ask?cancelled=1`,
  });
  await store.updateOrder(order.id, { stripe_checkout_session_id: session.id, stripe_customer_id: session.customerId });
  return { url: session.url, orderId: order.id };
}

/** Stripe → checkout.session.completed (mode=setup): save the card, place one hold per school, send. */
export async function handleAskSetupCompleted(deps: Deps, sessionId: string) {
  const order = await deps.store.getOrderBySession(sessionId);
  if (!order) throw new Error(`No Coach Line order for session ${sessionId}`);
  const { customerId, paymentMethodId } = await deps.payments.getSetupDetails(sessionId);
  await deps.store.updateOrder(order.id, { status: "authorized", stripe_customer_id: customerId, stripe_payment_method_id: paymentMethodId });
  const all = await deps.store.listRequests({ order_id: order.id, limit: 10 });
  const first = all[0];
  if (first) {
    await deps.store.upsertSavedPayer({
      email: first.purchaser_email, stripe_customer_id: customerId, stripe_payment_method_id: paymentMethodId,
      name: first.purchaser_name, phone: first.purchaser_phone, athlete_name: first.athlete_name,
      athlete_grad_year: first.grad_year, athlete_position: first.position, athlete_sport: first.sport, athlete_film_url: first.film_url,
    });
  }
  const sent: { school: string; price: number }[] = [];
  for (const r of all) {
    if (await holdAndSend(deps, r, customerId, paymentMethodId)) sent.push({ school: r.target_school ?? "School", price: r.price_cents });
  }
  if (first && sent.length) {
    await sendEmail(deps, {
      to: first.purchaser_email,
      rendered: orderReceipt({ email: first.purchaser_email, name: first.purchaser_name, athlete: first.athlete_name, schools: sent, postalAddress: env.postalAddress() }),
      template: "ask_receipt", idempotencyKey: `ask-receipt-${order.id}`, requestId: first.id,
    }).catch((e) => log("warn", "ask receipt failed", { error: String(e) }));
    if (first.purchaser_phone && first.purchaser_sms_opt_in_at)
      await sendSms(deps, { to: first.purchaser_phone, body: lineSms.parentSent(sent.length, sent[0]!.school), template: "parent_sent", dedupeKey: `ask-sent-${order.id}`, requestId: first.id });
  }
}

/** Place this school's hold on the saved card and deliver the message to the first coach. */
export async function holdAndSend(deps: Deps, r: EvalRequest, customerId: string, paymentMethodId: string): Promise<boolean> {
  if (r.status !== "awaiting_payment") return r.status !== "cancelled";
  let hold;
  try {
    hold = await deps.payments.holdOffSession({ requestId: r.id, amountCents: r.price_cents, customerId, paymentMethodId, description: `Coach Line — ${r.target_school} (${r.ref})` });
  } catch (e) {
    await deps.store.casRequest(r.id, { status: ["awaiting_payment"] }, { status: "cancelled", last_error: `hold failed: ${String(e).slice(0, 200)}` });
    await alertAdmin(deps, "Coach Line hold failed", [`${r.ref}: ${String(e)}`]);
    return false;
  }
  if (hold.status !== "requires_capture" && hold.status !== "succeeded") {
    await deps.store.casRequest(r.id, { status: ["awaiting_payment"] }, { status: "cancelled", last_error: `hold status ${hold.status}` });
    return false;
  }
  const settings = await deps.store.getSettings();
  const now = deps.now();
  let deadline = now.getTime() + settings.deadline_days * 86_400_000;
  if (hold.captureBefore) deadline = Math.min(deadline, hold.captureBefore.getTime() - 12 * 3_600_000);
  const paid = await deps.store.casRequest(r.id, { status: ["awaiting_payment"] }, {
    status: "paid", paid_at: iso(now), expires_at: iso(new Date(deadline)), stripe_payment_intent_id: hold.paymentIntentId,
    stripe_charge_id: hold.chargeId, authorization_expires_at: hold.captureBefore ? iso(hold.captureBefore) : null,
    payment_captured_at: hold.status === "succeeded" ? iso(now) : null,
  });
  if (!paid) return false;
  await deps.store.addEvent({ request_id: r.id, type: "hold_placed", actor: "stripe", from_status: "awaiting_payment", to_status: "paid", data: { amount: r.price_cents } });
  await deps.store.track("paid", paid.coach_id, paid.id).catch(() => {});
  const { notifyCoach } = await import("./lifecycle");
  await notifyCoach(deps, paid.id);
  return true;
}

/* ─────────────── Answer links (one per coach in the chain) ─────────────── */

const hex = (uuid: string) => uuid.replace(/-/g, "");
const unhex = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;

export function answerUrl(req: EvalRequest, coach: Coach, kind?: string) {
  const t = makeToken("coach", `${hex(req.id)}x${hex(coach.id)}`, req.coach_link_nonce);
  return `${env.siteUrl()}/a/${t}${kind ? `?k=${kind}` : ""}`;
}

export async function resolveAnswerLink(deps: Deps, token: string): Promise<{ req: EvalRequest; coach: Coach } | null> {
  const id = tokenId(token);
  const m = id?.match(/^([0-9a-f]{32})x([0-9a-f]{32})$/);
  if (!m) return null;
  const req = await deps.store.getRequest(unhex(m[1]!));
  if (!req || !verifyToken("coach", token, req.coach_link_nonce)) return null;
  const coachId = unhex(m[2]!);
  if (!req.escalation_ids.includes(coachId)) return null;
  const coach = await deps.store.getCoach(coachId);
  return coach ? { req, coach } : null;
}

/** Send (or re-send on escalation) the "answer in one tap" email + text to one coach. */
export async function sendAskInvite(deps: Deps, req: EvalRequest, coach: Coach, opts: { escalated?: boolean; reminder?: { daysLeft: number; nudge?: boolean }; key: string }) {
  const { replyAddress } = await import("./email-native");
  await sendEmail(deps, {
    to: coach.email!,
    rendered: coachAskInvite({
      req, coach, answerUrl: (k) => answerUrl(req, coach, k), declineUrl: coachDeclineUrl(req), unsubscribeUrl: unsubscribeUrl(coach.email!),
      hubUrl: hubUrl(coach), postalAddress: env.postalAddress(), earnCents: req.coach_payout_cents, escalated: opts.escalated, reminder: opts.reminder,
    }),
    template: opts.reminder ? "ask_reminder" : opts.escalated ? "ask_escalated" : "ask_invite",
    idempotencyKey: opts.key,
    requestId: req.id,
    coachId: coach.id,
    marketing: true,
    replyTo: replyAddress(req),
  });
  if (coach.phone && coach.sms_opt_in_at && !coach.sms_opted_out && !opts.reminder) {
    const r = await sendSms(deps, { to: coach.phone, body: lineSms.coachAsk(req, answerUrl(req, coach), req.coach_payout_cents), template: "ask_sms", dedupeKey: `sms-${opts.key}`, requestId: req.id, coachId: coach.id });
    if (r === "opted_out") await deps.store.updateCoach(coach.id, { sms_opted_out: true });
  }
}

/* ─────────────────────────────── Answers ─────────────────────────────── */

export interface AnswerInput {
  kind: AnswerKind;
  note?: string | null;
  camp?: CampItem | null;
  event?: EventItem | null;
  level?: string | null;
  save?: boolean;
  via: "link" | "email";
}

export function answerSummary(kind: AnswerKind, pl: Record<string, unknown>): string {
  switch (kind) {
    case "camp": return `Camp invite: ${pl.name} (${pl.dates}).`;
    case "event": return `They'll be at ${pl.name} (${pl.dates}).`;
    case "film": return "They'd like to see more film.";
    case "update": return "They asked you to keep them updated.";
    case "level": return `Their read: better fit at ${pl.level}.`;
    default: return `"${String(pl.note ?? "").slice(0, 120)}"`;
  }
}

/** First answer wins: charge the hold, deliver to the parent, credit the answering coach. */
export async function submitAnswer(deps: Deps, req: EvalRequest, coach: Coach, a: AnswerInput): Promise<EvalRequest> {
  if (!req.escalation_ids.includes(coach.id)) throw new UserFacingError("This request isn't addressed to you.");
  const now = iso(deps.now());
  const payload: Record<string, unknown> = { note: a.note?.trim() || null };
  if (a.kind === "camp") {
    const c = a.camp ?? coach.camps?.[0];
    if (!c?.name || !c?.dates) throw new UserFacingError("Add your camp name and dates.");
    Object.assign(payload, { name: c.name, dates: c.dates, location: c.location ?? null, url: c.url ?? null });
  }
  if (a.kind === "event") {
    const e = a.event ?? coach.events?.[0];
    if (!e?.name || !e?.dates) throw new UserFacingError("Add the event name and dates.");
    Object.assign(payload, { name: e.name, dates: e.dates, location: e.location ?? null });
  }
  if (a.kind === "level") {
    if (!a.level) throw new UserFacingError("Pick the level you think fits best.");
    payload.level = a.level;
  }
  if (a.kind === "personal" && !(a.note && a.note.trim().length >= 3)) throw new UserFacingError("Write a short reply.");
  if (a.camp?.url && !/^https:\/\//.test(a.camp.url)) throw new UserFacingError("Camp link must start with https://");

  const r = await deps.store.casRequest(
    req.id,
    { status: ["paid", "coach_notified", "accepted"], expiresAfter: now },
    {
      status: "submitted", submitted_at: now, accepted_at: req.accepted_at ?? now, coach_id: coach.id,
      answer_kind: a.kind, answer_payload: payload, response_kind: "written",
      response_text: answerSummary(a.kind, payload) + (payload.note && a.kind !== "personal" ? `\n\n${payload.note}` : ""),
      level_read: a.kind === "level" ? String(payload.level) : req.level_read, response_from: a.via,
    },
  );
  if (!r) {
    const cur = (await deps.store.getRequest(req.id))!;
    if (["submitted", "completed"].includes(cur.status)) throw new UserFacingError("Another coach on your staff already answered — thank you!", "closed");
    throw new UserFacingError("This message has closed.", "closed");
  }
  // Save camp / event for next time (one-tap from then on).
  if (a.save && a.kind === "camp" && a.camp && !coach.camps.some((c) => c.name === a.camp!.name && c.dates === a.camp!.dates))
    await deps.store.updateCoach(coach.id, { camps: [...coach.camps, a.camp].slice(-6) });
  if (a.save && a.kind === "event" && a.event && !coach.events.some((e) => e.name === a.event!.name && e.dates === a.event!.dates))
    await deps.store.updateCoach(coach.id, { events: [...coach.events, a.event].slice(-6) });
  const hours = r.paid_at ? (Date.parse(now) - Date.parse(r.paid_at)) / 3_600_000 : 0;
  await deps.store.updateCoach(coach.id, { answers_count: coach.answers_count + 1, answer_hours_total: Number(coach.answer_hours_total) + Math.round(hours * 10) / 10 });
  await deps.store.addEvent({ request_id: r.id, type: "answered", actor: "coach", from_status: req.status, to_status: "submitted", data: { kind: a.kind, coach: coach.full_name, via: a.via } });

  if (!(await capturePayment(deps, r.id))) return (await deps.store.getRequest(r.id))!;
  const settings = await deps.store.getSettings();
  if (settings.require_admin_review) {
    await alertAdmin(deps, "Coach Line answer awaiting review", [`${r.ref} — ${coach.full_name}`]);
    return (await deps.store.getRequest(r.id))!;
  }
  return completeRequest(deps, r.id, "coach");
}

/** Parse a coach's email reply to a Coach Line message: keywords or a free-text answer. */
export function parseAskReply(body: string): AnswerInput | "pass" | null {
  const t = body.trim();
  if (!t) return null;
  const first = t.split(/\s+/)[0]!.toUpperCase().replace(/[^A-Z]/g, "");
  const rest = t.slice(t.split(/\s+/)[0]!.length).trim();
  if (["PASS", "DECLINE", "NO"].includes(first) && t.split(/\s+/).length <= 4) return "pass";
  if (first === "CAMP") return { kind: "camp", note: rest || null, via: "email" };
  if (first === "EVENT") return { kind: "event", note: rest || null, via: "email" };
  if (first === "FILM") return { kind: "film", note: rest || null, via: "email" };
  if (first === "UPDATE") return { kind: "update", note: rest || null, via: "email" };
  if (first === "LEVEL") {
    const lvl = rest.match(/\b(D1|D2|D3|NAIA|JUCO|NJCAA|CCCAA)\b/i)?.[1]?.toUpperCase();
    return { kind: "level", level: lvl ?? (rest.split(/\s+/)[0] || "another level"), note: rest.replace(lvl ?? "", "").trim() || null, via: "email" };
  }
  return { kind: "personal", note: t.slice(0, 3000), via: "email" };
}

/* ─────────────────────────── Escalation (cron) ─────────────────────────── */

export async function escalateAsks(deps: Deps): Promise<number> {
  const settings = await deps.store.getSettings();
  const now = deps.now();
  let n = 0;
  for (const r of await deps.store.listRequests({ status: ["coach_notified", "accepted"], limit: 10000 })) {
    if (r.format !== "ask" || r.escalation_index >= r.escalation_ids.length - 1 || !r.expires_at) continue;
    const since = Date.parse(r.escalated_at ?? r.coach_notified_at ?? r.paid_at ?? r.created_at);
    if (now.getTime() - since < settings.escalate_after_hours * 3_600_000) continue;
    if (Date.parse(r.expires_at) - now.getTime() < 12 * 3_600_000) continue;
    const nextIdx = r.escalation_index + 1;
    const next = await deps.store.getCoach(r.escalation_ids[nextIdx]!);
    if (!next?.email || next.opted_out || next.removed) {
      await deps.store.casRequest(r.id, { status: ["coach_notified", "accepted"] }, { escalation_index: nextIdx, escalated_at: iso(now) });
      continue;
    }
    const e = await deps.store.casRequest(r.id, { status: ["coach_notified", "accepted"] }, {
      escalation_index: nextIdx, escalated_at: iso(now), coach_id: next.id, reminder_count: 0,
    });
    if (!e) continue;
    await deps.store.addEvent({ request_id: r.id, type: "escalated", actor: "cron", from_status: null, to_status: null, data: { to: next.full_name } });
    await sendAskInvite(deps, e, next, { escalated: true, key: `ask-esc-${r.id}-${nextIdx}` }).catch((err) => log("warn", "escalation email failed", { error: String(err) }));
    if (e.purchaser_phone && e.purchaser_sms_opt_in_at)
      await sendSms(deps, { to: e.purchaser_phone, body: lineSms.parentEscalated(e.target_school ?? "the school", next.full_name), template: "parent_escalated", dedupeKey: `parent-esc-${r.id}-${nextIdx}`, requestId: r.id });
    n++;
  }
  return n;
}

/* ─────────────────────────── Two-way relay ─────────────────────────── */

function sig(purpose: string, id: string, nonce: string) {
  return createHmac("sha256", env.appSecret()).update(`${purpose}:${id}:${nonce}`).digest("hex").slice(0, 12);
}
/** Address the PARENT replies to (relayed to the answering coach). */
export function parentThreadAddress(req: Pick<EvalRequest, "id" | "delivery_link_nonce">) {
  return `p-${hex(req.id)}-${sig("parent", req.id, req.delivery_link_nonce)}@${inboundDomain()}`;
}
/** Address a returning parent replies YES to (Gmail railway). */
export function draftAddress(d: Pick<AskDraft, "id">) {
  return `d-${hex(d.id)}-${sig("draft", d.id, "")}@${inboundDomain()}`;
}

export type LineAddress =
  | { kind: "parent_thread"; req: EvalRequest }
  | { kind: "draft"; draft: AskDraft }
  | { kind: "school"; school: string; sport: string }
  | { kind: "coach"; coach: Coach };

const okSig = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export function schoolLineAddress(school: string, sport: string) {
  return `${slugify(school)}--${slugify(sport)}@${inboundDomain()}`;
}
export function coachLineAddress(coach: Pick<Coach, "slug">) {
  return `coach.${coach.slug}@${inboundDomain()}`;
}

export async function resolveLineAddress(deps: Deps, addresses: string[]): Promise<LineAddress | null> {
  for (const raw of addresses) {
    const addr = (raw.match(/<([^>]+)>/)?.[1] ?? raw).trim().toLowerCase();
    if (!addr.endsWith(`@${inboundDomain()}`)) continue;
    const local = addr.split("@")[0]!;
    let m = local.match(/^p-([0-9a-f]{32})-([0-9a-f]{12})$/);
    if (m) {
      const req = await deps.store.getRequest(unhex(m[1]!));
      if (req && okSig(m[2]!, sig("parent", req.id, req.delivery_link_nonce))) return { kind: "parent_thread", req };
      continue;
    }
    m = local.match(/^d-([0-9a-f]{32})-([0-9a-f]{12})$/);
    if (m) {
      const draft = await deps.store.getDraft(unhex(m[1]!));
      if (draft && okSig(m[2]!, sig("draft", draft.id, ""))) return { kind: "draft", draft };
      continue;
    }
    m = local.match(/^coach\.([a-z0-9-]+)$/);
    if (m) {
      const coach = await deps.store.getCoachBySlug(m[1]!);
      if (coach && !coach.removed) return { kind: "coach", coach };
      continue;
    }
    m = local.match(/^([a-z0-9-]+)--([a-z0-9-]+)$/);
    if (m) {
      const words = m[1]!.split("-").filter((w) => w.length > 2).slice(0, 2).join(" ");
      for (const s of await deps.store.suggestSchools(words, 50)) {
        if (slugify(s.school) === m[1] && slugify(s.sport) === m[2]) return { kind: "school", school: s.school, sport: s.sport };
      }
    }
  }
  return null;
}

/** Coach → parent (after the first answer). */
export async function relayToParent(deps: Deps, req: EvalRequest, body: string, channel: "email" | "sms" | "web") {
  if ((await deps.store.listThread(req.id)).length >= MAX_THREAD) return "limit";
  const coach = (await deps.store.getCoach(req.coach_id))!;
  await deps.store.addThreadMessage({ request_id: req.id, direction: "coach_to_parent", channel, body });
  await sendEmail(deps, {
    to: req.purchaser_email,
    rendered: relayMessage({ toRole: "parent", fromName: coach.full_name, req, body, postalAddress: env.postalAddress() }),
    template: "relay_to_parent", idempotencyKey: `relay-p-${req.id}-${Date.now()}`, requestId: req.id, replyTo: parentThreadAddress(req),
  });
  if (req.purchaser_phone && req.purchaser_sms_opt_in_at)
    await sendSms(deps, { to: req.purchaser_phone, body: lineSms.relayToParent(coach.full_name, body), template: "relay_sms", dedupeKey: `relay-sms-${req.id}-${Date.now()}`, requestId: req.id });
  return "relayed";
}

/** Parent → coach (after the first answer). Email or SMS. */
export async function relayToCoach(deps: Deps, req: EvalRequest, body: string, channel: "email" | "sms" | "web") {
  if (!["completed"].includes(req.status)) return "not_open";
  if ((await deps.store.listThread(req.id)).length >= MAX_THREAD) return "limit";
  const coach = await deps.store.getCoach(req.coach_id);
  if (!coach?.email || coach.opted_out) return "unreachable";
  const { replyAddress } = await import("./email-native");
  await deps.store.addThreadMessage({ request_id: req.id, direction: "parent_to_coach", channel, body });
  await sendEmail(deps, {
    to: coach.email,
    rendered: relayMessage({ toRole: "coach", fromName: req.purchaser_name, req, body, postalAddress: env.postalAddress() }),
    template: "relay_to_coach", idempotencyKey: `relay-c-${req.id}-${Date.now()}`, requestId: req.id, coachId: coach.id, replyTo: replyAddress(req),
  });
  return "relayed";
}

/** A parent texting back → relayed to the coach of their most recent answered Coach Line message. */
export async function handleParentSms(deps: Deps, fromPhone: string, body: string) {
  const phone = toE164(fromPhone);
  if (!phone || !body.trim()) return "ignored";
  if (/^(stop|unsubscribe|cancel|end|quit|help|start)$/i.test(body.trim())) return "keyword"; // Twilio handles these
  const recent = (await deps.store.listRequests({ status: ["completed"], limit: 2000 }))
    .filter((r) => r.format === "ask" && r.purchaser_phone === phone)
    .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  const req = recent[0];
  if (!req) return "no_thread";
  return relayToCoach(deps, req, body.trim().slice(0, 1600), "sms");
}

/* ─────────────────────────── Gmail railway ─────────────────────────── */

/** A parent emailed a school's (or coach's) Coach Line address from their own inbox. */
export async function handleParentEmail(deps: Deps, a: { from: string; subject: string; body: string; target: Extract<LineAddress, { kind: "school" | "coach" }> }) {
  const settings = await deps.store.getSettings();
  const school = a.target.kind === "coach" ? a.target.coach.school ?? a.target.coach.full_name : a.target.school;
  const sport = a.target.kind === "coach" ? a.target.coach.sport : a.target.sport;
  const payer = await deps.store.getSavedPayer(a.from);
  // A returning parent doesn't have to paste their film again.
  const film = a.body.match(/https:\/\/[^\s<>()"']+/)?.[0] ?? payer?.athlete_film_url ?? null;
  const draft = await deps.store.insertDraft({
    from_email: a.from.toLowerCase(), target_school: school, target_sport: sport,
    coach_id: a.target.kind === "coach" ? a.target.coach.id : null, subject: a.subject.slice(0, 200), message: a.body.slice(0, 2000), film_url: film,
  });
  const price = askPricing(settings.ask_prices, 1).total;
  if (payer && payer.athlete_name && film) {
    await sendEmail(deps, {
      to: a.from, rendered: draftConfirmYes({ school, priceCents: price, athlete: payer.athlete_name, postalAddress: env.postalAddress() }),
      template: "draft_yes", idempotencyKey: `draft-yes-${draft.id}`, replyTo: draftAddress(draft),
    });
    return "awaiting_yes";
  }
  const confirmUrl = `${env.siteUrl()}/ask/confirm/${makeToken("again", hex(draft.id), "draft")}`;
  await sendEmail(deps, {
    to: a.from, rendered: draftConfirmFirstTime({ school, priceCents: price, confirmUrl, postalAddress: env.postalAddress() }),
    template: "draft_confirm", idempotencyKey: `draft-confirm-${draft.id}`,
  });
  return "awaiting_confirm";
}

export async function resolveDraftToken(deps: Deps, token: string): Promise<AskDraft | null> {
  const id = tokenId(token);
  if (!id || !/^[0-9a-f]{32}$/.test(id) || !verifyToken("again", token, "draft")) return null;
  const d = await deps.store.getDraft(unhex(id));
  return d && d.status === "pending" ? d : null;
}

/** Returning parent replied YES: create the ask on their saved card — 100% from Gmail. */
export async function confirmDraftByEmail(deps: Deps, draft: AskDraft, body: string) {
  if (draft.status !== "pending") return "already";
  if (!/^\s*(yes|y|yep|yeah|send|send it|confirm)\b/i.test(body)) return "not_yes";
  const payer = await deps.store.getSavedPayer(draft.from_email);
  if (!payer?.athlete_name) return "no_card";
  const settings = await deps.store.getSettings();
  const coach = draft.coach_id ? await deps.store.getCoach(draft.coach_id) : null;
  const chain = await buildChain(deps, { coach, school: draft.target_school, sport: draft.target_sport });
  if (!chain.length) return "unreachable";
  const price = askPricing(settings.ask_prices, 1).total;
  const pb = priceBreakdown(price, { commission_bps: 10_000 - settings.ask_coach_share_bps });
  const now = deps.now();
  const order = await deps.store.insertOrder({ ref: randomRef(), stripe_checkout_session_id: null, purchaser_email: draft.from_email, total_cents: price, school_count: 1 });
  await deps.store.updateOrder(order.id, { status: "authorized", stripe_customer_id: payer.stripe_customer_id, stripe_payment_method_id: payer.stripe_payment_method_id });
  const minor = (payer.athlete_grad_year ?? 0) >= now.getFullYear() + 1;
  const req = await deps.store.insertRequest({
    ref: randomRef(), coach_id: chain[0]!.id, athlete_name: payer.athlete_name, sport: chain[0]!.sport, position: payer.athlete_position ?? "",
    grad_year: payer.athlete_grad_year ?? now.getFullYear() + 1, film_url: draft.film_url ?? "", athlete_email: null, metrics: null, gpa: null,
    message: draft.message, athlete_is_minor: minor, purchaser_name: payer.name ?? draft.from_email, purchaser_email: draft.from_email,
    purchaser_relationship: "parent_guardian", guardian_consent_at: minor ? iso(now) : null, terms_accepted_at: iso(now), currency: "usd",
    price_cents: pb.price_cents, platform_fee_cents: pb.platform_fee_cents, coach_payout_cents: pb.coach_payout_cents, utm_source: "gmail",
    utm_campaign: null, parent_request_id: null, format: "ask", target_school: draft.target_school, target_sport: chain[0]!.sport,
    escalation_ids: chain.map((c) => c.id), order_id: order.id, purchaser_phone: payer.phone, purchaser_sms_opt_in_at: payer.phone ? iso(now) : null,
  });
  await deps.store.updateDraft(draft.id, { status: "sent", request_id: req.id });
  const ok = await holdAndSend(deps, req, payer.stripe_customer_id, payer.stripe_payment_method_id);
  if (ok) {
    await sendEmail(deps, {
      to: draft.from_email,
      rendered: orderReceipt({ email: draft.from_email, name: payer.name ?? "", athlete: payer.athlete_name, schools: [{ school: draft.target_school ?? "School", price }], postalAddress: env.postalAddress() }),
      template: "ask_receipt", idempotencyKey: `ask-receipt-${order.id}`, requestId: req.id,
    }).catch(() => {});
  }
  return ok ? "sent" : "hold_failed";
}

/** "Ask another school" link for an ask (pre-fills the athlete's details). */
export const askAnotherUrl = (req: EvalRequest) =>
  `${env.siteUrl()}/ask?from=${encodeURIComponent(new URL(secondOpinionUrl(req)).searchParams.get("from") ?? "")}`;

export { refundRequest };

/** Coach opened the answer page: record it and tell the parent once ("Coach X just opened your message"). */
export async function markAskOpened(deps: Deps, req: EvalRequest, coach: Coach) {
  const open: EvalRequest["status"][] = ["paid", "coach_notified", "accepted"];
  if (!req.coach_viewed_at) await deps.store.casRequest(req.id, { status: open }, { coach_viewed_at: iso(deps.now()) });
  if (req.parent_notified_open_at) return;
  const r = await deps.store.casRequest(req.id, { status: open, isNull: ["parent_notified_open_at"] }, { parent_notified_open_at: iso(deps.now()) });
  if (!r) return;
  await deps.store.addEvent({ request_id: r.id, type: "coach_viewed", actor: "coach", from_status: r.status, to_status: r.status, data: { coach: coach.full_name } });
  if (r.purchaser_phone && r.purchaser_sms_opt_in_at)
    await sendSms(deps, { to: r.purchaser_phone, body: lineSms.parentOpened(`${coach.full_name}${coach.school ? ` (${coach.school})` : ""}`), template: "parent_opened", dedupeKey: `parent-opened-${r.id}`, requestId: r.id }).catch(() => {});
}

/** Coach taps "Not me — pass it on": next coach on staff gets it; the last one passing releases the hold. */
export async function passAsk(deps: Deps, req: EvalRequest, coach: Coach): Promise<"passed_on" | "declined" | "closed"> {
  if (!["paid", "coach_notified", "accepted"].includes(req.status)) return "closed";
  if (req.escalation_index < req.escalation_ids.length - 1) {
    await deps.store.casRequest(req.id, { status: ["paid", "coach_notified", "accepted"] }, { escalated_at: "1970-01-01T00:00:00.000Z" });
    await escalateAsks(deps);
    await deps.store.addEvent({ request_id: req.id, type: "passed", actor: "coach", from_status: req.status, to_status: req.status, data: { coach: coach.full_name } });
    return "passed_on";
  }
  const { declineRequest } = await import("./lifecycle");
  await declineRequest(deps, req, "Coach passed", "coach");
  return "declined";
}
