import { randomUUID } from "node:crypto";
import type { Deps } from "../deps";
import { env } from "../env";
import { VIDEO_MAX_BYTES, VIDEO_MIME_TYPES, VIDEO_MIN_BYTES } from "../constants";
import { coachInvite, coachWeekly, coachWelcome, familyFilmIssue, sms as smsText } from "../email/templates";
import { log } from "../log";
import type { Coach, EvalRequest } from "../types";
import { coachDeclineUrl, coachReviewUrl, fixFilmUrl, hubUrl, unsubscribeUrl, adminRequestUrl } from "./links";
import { alertAdmin, sendEmail, textAdmin } from "./notify";
import { textCoach, UserFacingError } from "./lifecycle";

const iso = (d: Date) => d.toISOString();
const OPEN = ["paid", "coach_notified", "accepted"] as const;

async function event(deps: Deps, requestId: string, type: string, actor: string, data?: Record<string, unknown>) {
  await deps.store.addEvent({ request_id: requestId, type, actor, from_status: null, to_status: null, data: data ?? null }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Film link: catch private/broken links BEFORE the family pays
// ---------------------------------------------------------------------------
export type FilmCheck = { status: "ok" | "private" | "not_found" | "unknown"; message?: string };

/**
 * Checks only well-known video hosts through their official public endpoints (no arbitrary URL fetching,
 * so this can't be abused to make our server call internal addresses). Anything uncertain → "unknown" (allowed).
 */
export async function checkFilmLink(raw: string, fetchImpl: typeof fetch = fetch): Promise<FilmCheck> {
  let u: URL;
  try { u = new URL(raw); } catch { return { status: "not_found", message: "That doesn't look like a link." }; }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const get = async (url: string) => {
    try {
      const res = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(4000), headers: { "User-Agent": "TheAthleteMarket-LinkCheck/1.0" } });
      return res;
    } catch {
      return null;
    }
  };
  if (host === "youtube.com" || host === "youtu.be") {
    const r = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(raw)}`);
    if (!r) return { status: "unknown" };
    if (r.status === 200) return { status: "ok" };
    if (r.status === 401 || r.status === 403)
      return { status: "private", message: "This YouTube video is Private. In YouTube Studio set it to Unlisted (or Public), then paste the link again." };
    if (r.status === 404 || r.status === 400) return { status: "not_found", message: "We couldn't find that YouTube video. Check the link." };
    return { status: "unknown" };
  }
  if (host === "vimeo.com") {
    const r = await get(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(raw)}`);
    if (!r) return { status: "unknown" };
    if (r.status === 200) return { status: "ok" };
    if (r.status === 403) return { status: "private", message: "This Vimeo video is private. Set privacy to “Anyone with the link”, then paste it again." };
    if (r.status === 404) return { status: "not_found", message: "We couldn't find that Vimeo video. Check the link." };
    return { status: "unknown" };
  }
  if (host === "drive.google.com" || host === "docs.google.com") {
    const r = await get(raw);
    if (!r) return { status: "unknown" };
    const loc = r.headers.get("location") ?? "";
    if ((r.status >= 300 && r.status < 400 && loc.includes("accounts.google.com")) || r.status === 401 || r.status === 403)
      return { status: "private", message: "This Google Drive file is private. Click Share → General access → “Anyone with the link”, then paste it again." };
    if (r.status === 404) return { status: "not_found", message: "We couldn't find that Google Drive file. Check the link." };
    return { status: "ok" };
  }
  return { status: "unknown" };
}

export function filmTip(raw: string): string | null {
  const h = (() => { try { return new URL(raw).hostname; } catch { return ""; } })();
  if (h.includes("hudl")) return "Hudl: open your highlight → Share → copy the public link. Private team film can't be opened by coaches.";
  if (h.includes("drive.google")) return "Google Drive: Share → General access → “Anyone with the link”.";
  if (h.includes("youtu")) return "YouTube: Unlisted or Public both work. Private does not.";
  return null;
}

// ---------------------------------------------------------------------------
// Coach can't open the film → family fixes the link (no cancellation)
// ---------------------------------------------------------------------------
export async function reportFilmIssue(deps: Deps, req: EvalRequest, note: string | null) {
  if (!OPEN.includes(req.status as (typeof OPEN)[number])) throw new UserFacingError("This request is no longer open.", "closed");
  const r = await deps.store.casRequest(req.id, { status: [...OPEN], isNull: ["film_issue_at"] }, { film_issue_at: iso(deps.now()), film_issue_note: note });
  if (!r) {
    const cur = await deps.store.getRequest(req.id);
    if (cur?.film_issue_at && OPEN.includes(cur.status as (typeof OPEN)[number])) return cur; // already reported
    throw new UserFacingError("This request is no longer open.", "closed");
  }
  await event(deps, r.id, "film_issue_reported", "coach", { note });
  const coach = (await deps.store.getCoach(r.coach_id))!;
  try {
    await sendEmail(deps, {
      to: r.purchaser_email,
      rendered: familyFilmIssue({ req: r, coach, fixUrl: fixFilmUrl(r), postalAddress: env.postalAddress() }),
      template: "family_film_issue",
      idempotencyKey: `film-issue-${r.id}`,
      requestId: r.id,
    });
  } catch (e) {
    await alertAdmin(deps, "Film-issue email failed", [`${r.ref}: ${String(e)}`], adminRequestUrl(r.id));
  }
  return r;
}

export async function fixFilmLink(deps: Deps, req: EvalRequest, filmUrl: string) {
  if (!OPEN.includes(req.status as (typeof OPEN)[number])) throw new UserFacingError("This request is no longer open.", "closed");
  const check = await checkFilmLink(filmUrl);
  if (check.status === "private" || check.status === "not_found") throw new UserFacingError(check.message ?? "That link doesn't work.");
  // Give the coach up to 48 more hours — but never past the point where the card hold can still be charged.
  let expires = req.expires_at;
  if (req.authorization_expires_at && req.expires_at) {
    const limit = Date.parse(req.authorization_expires_at) - 12 * 3_600_000;
    const wanted = Math.max(Date.parse(req.expires_at), deps.now().getTime()) + 48 * 3_600_000;
    expires = iso(new Date(Math.min(limit, wanted)));
    if (Date.parse(expires) < Date.parse(req.expires_at)) expires = req.expires_at;
  }
  const r = await deps.store.casRequest(req.id, { status: [...OPEN] }, { film_url: filmUrl, film_issue_at: null, film_issue_note: null, expires_at: expires });
  if (!r) throw new UserFacingError("This request is no longer open.", "closed");
  await event(deps, r.id, "film_link_fixed", "purchaser", { extended_to: expires });
  const coach = (await deps.store.getCoach(r.coach_id))!;
  if (coach.email && !(await deps.store.isSuppressed(coach.email))) {
    await sendEmail(deps, {
      to: coach.email,
      rendered: coachInvite({
        req: r, coach, reviewUrl: coachReviewUrl(r), declineUrl: coachDeclineUrl(r), unsubscribeUrl: unsubscribeUrl(coach.email),
        postalAddress: env.postalAddress(), hubUrl: hubUrl(coach), filmUpdated: true,
      }),
      template: "coach_film_updated",
      idempotencyKey: `film-updated-${r.id}-${randomUUID()}`,
      requestId: r.id,
      coachId: coach.id,
      marketing: true,
    }).catch((e) => log("error", "film updated email failed", { error: String(e) }));
  }
  await textCoach(deps, coach, r, smsText.coachFilmUpdated(r, coachReviewUrl(r)), `coach-sms-film-${r.id}-${Date.now()}`, "coach_film_updated");
  return r;
}

// ---------------------------------------------------------------------------
// Family rating (once per delivery)
// ---------------------------------------------------------------------------
export async function rateDelivery(deps: Deps, req: EvalRequest, a: { rating: number; wouldBuyAgain?: boolean | null; comment: string | null }) {
  if (req.status !== "completed") throw new UserFacingError("Only delivered evaluations can be rated.");
  if (req.rated_at) return req;
  const r = await deps.store.casRequest(req.id, { status: ["completed"], isNull: ["rated_at"] }, {
    rating: a.rating, would_buy_again: a.wouldBuyAgain ?? null, rating_comment: a.comment, rated_at: iso(deps.now()),
  });
  if (!r) return (await deps.store.getRequest(req.id)) ?? req; // already rated
  const coach = (await deps.store.getCoach(r.coach_id))!;
  await deps.store.updateCoach(coach.id, { rating_sum: coach.rating_sum + a.rating, rating_count: coach.rating_count + 1 });
  await event(deps, r.id, "rated", "purchaser", { rating: a.rating, would_buy_again: a.wouldBuyAgain });
  if (a.rating <= 2) {
    await alertAdmin(deps, `Low rating (${a.rating}/5)`, [`${r.ref} — ${coach.full_name}`, a.comment ?? "(no comment)"], adminRequestUrl(r.id));
    await textAdmin(deps, smsText.adminLowRating(r, a.rating), `admin-rating-${r.id}`);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Coach hub: pause, intro video, payout invite, weekly earnings
// ---------------------------------------------------------------------------
export async function setPaused(deps: Deps, coach: Coach, paused: boolean) {
  return deps.store.updateCoach(coach.id, { paused });
}

export async function createIntroUploadTarget(deps: Deps, coach: Coach, f: { mime: string; size: number }) {
  const mime = f.mime.split(";")[0]!.trim().toLowerCase() || "video/mp4";
  if (!VIDEO_MIME_TYPES.includes(mime)) throw new UserFacingError("Please use an MP4, MOV or WebM video.");
  if (f.size > VIDEO_MAX_BYTES) throw new UserFacingError("That video is too large (500 MB max).");
  if (f.size < VIDEO_MIN_BYTES) throw new UserFacingError("That video looks empty. Please record again.");
  if (!(await deps.store.rateLimit(`intro:${coach.id}`, 3600, 20))) throw new UserFacingError("Too many uploads. Please wait a few minutes.", "rate_limited");
  const ext = mime === "video/webm" ? "webm" : mime === "video/quicktime" ? "mov" : "mp4";
  const path = `coaches/${coach.id}/intro-${randomUUID()}.${ext}`;
  const { url } = await deps.storage.createUploadUrl(path);
  return { uploadUrl: url, path, contentType: mime };
}

export async function saveIntroVideo(deps: Deps, coach: Coach, a: { path: string; durationSeconds?: number | null }) {
  if (!a.path.startsWith(`coaches/${coach.id}/intro-`) || a.path.includes("..")) throw new UserFacingError("Invalid upload.");
  if (a.durationSeconds != null && a.durationSeconds > 90) throw new UserFacingError("Please keep your intro under 90 seconds (15–30 is ideal).");
  const stat = await deps.storage.stat(a.path);
  if (!stat || stat.size < VIDEO_MIN_BYTES) throw new UserFacingError("We couldn't find your upload. Please try again.");
  const old = coach.intro_video_path;
  const updated = await deps.store.updateCoach(coach.id, { intro_video_path: a.path });
  if (old && old !== a.path) await deps.storage.remove(old).catch(() => {});
  return updated;
}

/** Sent when an admin approves a coach: finish Stripe payout setup now, so every delivery pays instantly. */
export async function sendPayoutInvite(deps: Deps, coach: Coach, force = false) {
  if (!coach.email) throw new UserFacingError("Coach has no email address.");
  if (coach.payout_invite_sent_at && !force) return coach;
  await sendEmail(deps, {
    to: coach.email,
    rendered: coachWelcome({ coach, hubUrl: hubUrl(coach), postalAddress: env.postalAddress() }),
    template: "coach_welcome",
    idempotencyKey: `coach-welcome-${coach.id}${force ? `-${Date.now()}` : ""}`,
    coachId: coach.id,
  });
  return deps.store.updateCoach(coach.id, { payout_invite_sent_at: iso(deps.now()) });
}

export async function sendWeeklySummaries(deps: Deps): Promise<number> {
  const now = deps.now();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  let sent = 0;
  for (const coach of await deps.store.listParticipatingCoaches()) {
    if (!coach.email || coach.opted_out) continue;
    if (coach.last_summary_at && coach.last_summary_at > new Date(now.getTime() - 6.5 * 86_400_000).toISOString()) continue;
    const reqs = await deps.store.listRequests({ coach_id: coach.id });
    const week = reqs.filter((r) => r.paid_out_at && r.paid_out_at >= weekAgo && r.payout_status === "paid");
    if (!week.length) continue;
    const open = reqs.filter((r) => OPEN.includes(r.status as (typeof OPEN)[number])).length;
    if (await deps.store.isSuppressed(coach.email)) continue;
    try {
      await sendEmail(deps, {
        to: coach.email,
        rendered: coachWeekly({
          coach, count: week.length, earnedCents: week.reduce((s, r) => s + r.coach_payout_cents, 0), openCount: open,
          hubUrl: hubUrl(coach), postalAddress: env.postalAddress(),
        }),
        template: "coach_weekly",
        idempotencyKey: `coach-weekly-${coach.id}-${now.toISOString().slice(0, 10)}`,
        coachId: coach.id,
        marketing: true,
      });
      await deps.store.updateCoach(coach.id, { last_summary_at: iso(now) });
      sent++;
    } catch (e) {
      log("warn", "weekly summary failed", { coach_id: coach.id, error: String(e) });
    }
  }
  return sent;
}

export { deliveryBadge, ratingBadge } from "./coach-stats";
