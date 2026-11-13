"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_COOKIE, requireAdmin } from "@/lib/admin";
import { env } from "@/lib/env";
import { parseCsv } from "@/lib/csv";
import { slugify } from "@/lib/format";
import { clientIp, getDeps } from "@/lib/server";
import { makeAdminSession, safeEqual } from "@/lib/tokens";
import { coachInvite } from "@/lib/email/templates";
import { coachDeclineUrl, coachReviewUrl, deliveryUrl, unsubscribeUrl } from "@/lib/services/links";
import { sendEmail } from "@/lib/services/notify";
import { purchaserDelivered } from "@/lib/email/templates";
import {
  attemptPayout, completeRequest, refundRequest, retryPayoutsForCoach, reversePayout, syncAccount, UserFacingError,
} from "@/lib/services/lifecycle";
import { DIVISIONS } from "@/lib/constants";
import { videoAvailableUntil } from "@/lib/retention";
import { sendPayoutInvite, setPaused } from "@/lib/services/experience";
import { toE164 } from "@/lib/phone";
import type { Coach } from "@/lib/types";

export async function login(_: { error?: string }, fd: FormData): Promise<{ error?: string }> {
  const deps = await getDeps();
  if (!(await deps.store.rateLimit(`admin-login:${await clientIp()}`, 900, 8))) return { error: "Too many attempts. Wait 15 minutes." };
  if (!safeEqual(String(fd.get("password") ?? ""), env.adminPassword())) return { error: "Incorrect password." };
  (await cookies()).set(ADMIN_COOKIE, makeAdminSession(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 12 * 3600,
  });
  redirect("/admin");
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

type Result = { ok?: string; error?: string };
async function run(fn: () => Promise<string | void>, path?: string): Promise<Result> {
  await requireAdmin();
  try {
    const ok = (await fn()) ?? "Done";
    if (path) revalidatePath(path);
    return { ok };
  } catch (e) {
    return { error: e instanceof UserFacingError ? e.message : e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------- requests
export async function requestAction(_: Result, fd: FormData): Promise<Result> {
  const id = String(fd.get("id"));
  const op = String(fd.get("op"));
  return run(async () => {
    const deps = await getDeps();
    const req = await deps.store.getRequest(id);
    if (!req) throw new Error("Not found");
    const coach = (await deps.store.getCoach(req.coach_id))!;
    await deps.store.addEvent({ request_id: id, type: `admin_${op}`, actor: "admin", from_status: req.status, to_status: null, data: null });
    switch (op) {
      case "approve_video": await completeRequest(deps, id, "admin"); return "Delivered to family";
      case "refund": await refundRequest(deps, id, "admin", "admin"); return "Refund issued";
      case "retry_payout": await attemptPayout(deps, id); return "Payout attempted";
      case "reverse_payout": await reversePayout(deps, id); return "Transfer reversed";
      case "resend_coach": {
        if (!coach.email) throw new Error("Coach has no email");
        await sendEmail(deps, {
          to: coach.email,
          rendered: coachInvite({ req, coach, reviewUrl: coachReviewUrl(req), declineUrl: coachDeclineUrl(req), unsubscribeUrl: unsubscribeUrl(coach.email), postalAddress: env.postalAddress() }),
          template: "coach_invite_resend", idempotencyKey: `coach-invite-resend-${id}-${Date.now()}`, requestId: id, coachId: coach.id, marketing: true,
        });
        return "Invitation re-sent";
      }
      case "resend_delivery": {
        if (req.status !== "completed") throw new Error("Not delivered yet");
        if (!req.video_path) throw new Error("The video has already been deleted");
        await sendEmail(deps, {
          to: req.purchaser_email, rendered: purchaserDelivered({ req, coach, videoUrl: deliveryUrl(req), availableUntil: videoAvailableUntil(req, await deps.store.getSettings()), postalAddress: env.postalAddress() }),
          template: "purchaser_delivered_resend", idempotencyKey: `delivered-resend-${id}-${Date.now()}`, requestId: id,
        });
        return "Delivery email re-sent";
      }
      case "revoke_delivery": await deps.store.casRequest(id, {}, { delivery_link_nonce: crypto.randomUUID() }); return "Delivery link revoked (resend to issue a new one)";
      case "extend": {
        const hours = Math.min(168, Math.max(1, Number(fd.get("hours") ?? 48)));
        const r = await deps.store.casRequest(id, { status: ["paid", "coach_notified", "accepted"] }, {
          expires_at: new Date(Math.max(Date.parse(req.expires_at ?? ""), deps.now().getTime()) + hours * 3_600_000).toISOString(),
        });
        if (!r) throw new Error("Only open requests can be extended");
        return `Deadline extended ${hours}h`;
      }
      case "delete_video": {
        if (req.video_path) await deps.storage.remove(req.video_path);
        await deps.store.casRequest(id, {}, { video_path: null });
        return "Video deleted";
      }
      default: throw new Error("Unknown action");
    }
  }, `/admin/requests/${id}`);
}

// ---------------------------------------------------------------- coaches
const coachSchema = z.object({
  full_name: z.string().trim().min(2).max(80),
  slug: z.string().trim().max(80).optional(),
  title: z.string().trim().max(80).optional(),
  school: z.string().trim().max(120).optional(),
  sport: z.string().trim().min(2).max(60),
  division: z.string().trim().max(30).optional(),
  conference: z.string().trim().max(80).optional(),
  state: z.string().trim().max(2).optional(),
  email: z.string().trim().toLowerCase().max(254).optional(),
  photo_url: z.string().trim().max(500).optional(),
  bio: z.string().trim().max(1500).optional(),
  credentials: z.string().trim().max(300).optional(),
  listing_type: z.enum(["directory", "participating"]),
  coach_kind: z.enum(["active_college", "former_college", "independent", "pro_player"]),
  verification_status: z.enum(["unverified", "pending", "verified", "rejected"]),
  eligibility_status: z.enum(["not_reviewed", "pending_review", "approved", "denied", "suspended"]),
  eligibility_basis: z.string().trim().max(1000).optional(),
  authorization_reference: z.string().trim().max(1000).optional(),
  eligibility_expires_at: z.string().trim().optional(),
  price_cents: z.string().trim().optional(),
  phone: z.string().trim().max(30).optional(),
  sms_consent: z.string().optional(),
  paused: z.string().optional(),
});
const nul = (v?: string) => (v ? v : null);

export async function saveCoach(_: Result, fd: FormData): Promise<Result> {
  const id = String(fd.get("id") ?? "");
  const parsed = coachSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) { await requireAdmin(); return { error: parsed.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`).join("; ") }; }
  const v = parsed.data;
  let newId = id;
  const res = await run(async () => {
    const deps = await getDeps();
    const prev = id ? await deps.store.getCoach(id) : null;
    const patch: Partial<Coach> = {
      full_name: v.full_name, title: nul(v.title), school: nul(v.school), sport: v.sport, division: nul(v.division),
      conference: nul(v.conference), state: v.state ? v.state.toUpperCase() : null, email: nul(v.email), photo_url: nul(v.photo_url),
      bio: nul(v.bio), credentials: nul(v.credentials), listing_type: v.listing_type, coach_kind: v.coach_kind,
      verification_status: v.verification_status, eligibility_status: v.eligibility_status,
      eligibility_basis: nul(v.eligibility_basis), authorization_reference: nul(v.authorization_reference),
      eligibility_expires_at: v.eligibility_expires_at ? new Date(v.eligibility_expires_at).toISOString() : null,
      price_cents: v.price_cents ? Number(v.price_cents) : null,
      paused: v.paused === "on",
    };
    const phone = toE164(v.phone);
    if (v.phone && !phone) throw new Error("Phone must be a valid US mobile number");
    patch.phone = phone;
    // Only record text consent the coach actually gave (application form, hub, or documented verbally/in writing).
    if (v.sms_consent === "on" && phone) { if (!prev?.sms_opt_in_at) patch.sms_opt_in_at = new Date().toISOString(); }
    else patch.sms_opt_in_at = null;
    if (prev?.eligibility_status !== v.eligibility_status) patch.eligibility_reviewed_at = new Date().toISOString();
    if (v.photo_url && !/^https:\/\//.test(v.photo_url)) throw new Error("Photo URL must be https");
    if (id) {
      await deps.store.updateCoach(id, patch);
    } else {
      const base = slugify(v.slug || v.full_name);
      let slug = base;
      for (let i = 2; await deps.store.getCoachBySlug(slug); i++) slug = `${base}-${i}`;
      newId = (await deps.store.insertCoach({ ...patch, slug, full_name: v.full_name, sport: v.sport })).id;
    }
    return "Saved";
  }, "/admin/coaches");
  if (!id && res.ok) redirect(`/admin/coaches/${newId}`);
  return res;
}

export async function coachAction(_: Result, fd: FormData): Promise<Result> {
  const id = String(fd.get("id"));
  const op = String(fd.get("op"));
  return run(async () => {
    const deps = await getDeps();
    const coach = await deps.store.getCoach(id);
    if (!coach) throw new Error("Not found");
    if (op === "sync_stripe") { const c = await syncAccount(deps, coach); return `Stripe: transfers ${c.stripe_transfers_active ? "active" : "inactive"}, details ${c.stripe_details_submitted ? "submitted" : "missing"}`; }
    if (op === "remove") { await deps.store.updateCoach(id, { removed: true }); return "Listing removed (hidden and can't be requested)"; }
    if (op === "restore") { await deps.store.updateCoach(id, { removed: false }); return "Listing restored"; }
    if (op === "name_ok") {
      await deps.store.updateCoach(id, { name_match_override: true });
      await retryPayoutsForCoach(deps, id);
      return "Name confirmed — held payouts released";
    }
    if (op === "send_payout_invite") { await sendPayoutInvite(deps, coach, true); return "Coach hub / payout setup email sent"; }
    if (op === "toggle_pause") { const c = await setPaused(deps, coach, !coach.paused); return c.paused ? "Paused" : "Accepting requests"; }
    if (op === "remove_intro") {
      if (coach.intro_video_path) await deps.storage.remove(coach.intro_video_path).catch(() => {});
      await deps.store.updateCoach(id, { intro_video_path: null });
      return "Intro video removed";
    }
    if (op === "opt_in") { await deps.store.updateCoach(id, { opted_out: false }); return "Coach opted back in (they must have asked). Remove the suppression in email_suppressions if needed."; }
    throw new Error("Unknown action");
  }, `/admin/coaches/${id}`);
}

export async function importCoaches(_: Result, fd: FormData): Promise<Result> {
  return run(async () => {
    const deps = await getDeps();
    const rows = parseCsv(String(fd.get("csv") ?? ""));
    if (!rows.length) throw new Error("No rows. First line must be headers: full_name,title,school,sport,division,conference,state");
    if (rows.length > 2000) throw new Error("Max 2000 rows per import");
    let created = 0, skipped = 0;
    for (const r of rows) {
      if (!r.full_name || !r.sport) { skipped++; continue; }
      const base = slugify(`${r.full_name} ${r.school ?? ""}`);
      if (await deps.store.getCoachBySlug(base)) { skipped++; continue; }
      await deps.store.insertCoach({
        slug: base, full_name: r.full_name, sport: r.sport, title: r.title || null, school: r.school || null,
        division: (DIVISIONS as readonly string[]).includes(r.division ?? "") ? r.division! : r.division || null,
        conference: r.conference || null, state: r.state ? r.state.toUpperCase().slice(0, 2) : null,
        email: r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) ? r.email.toLowerCase() : null,
        phone: null,
        listing_type: "directory", source: "import",
        coach_kind: (["active_college", "former_college", "independent", "pro_player"] as const).find((k) => k === r.type) ?? (r.division === "Professional" ? "pro_player" : "active_college"),
      });
      created++;
    }
    return `Imported ${created} directory listings (${skipped} skipped as duplicates/invalid)`;
  }, "/admin/coaches");
}

// ---------------------------------------------------------------- settings
export async function saveSettings(_: Result, fd: FormData): Promise<Result> {
  return run(async () => {
    const deps = await getDeps();
    const tiers = String(fd.get("tiers") ?? "").split(",").map((s) => Math.round(Number(s.trim()) * 100)).filter((n) => Number.isFinite(n) && n >= 500 && n <= 100_000);
    if (!tiers.length) throw new Error("Enter at least one price tier in dollars, e.g. 30,40,50");
    const pct = Number(fd.get("commission_pct"));
    if (!(pct >= 0 && pct <= 50)) throw new Error("Commission must be 0–50%");
    await deps.store.updateSettings({
      price_tiers_cents: [...new Set(tiers)].sort((a, b) => a - b),
      format_prices: Object.fromEntries((["written", "voice", "video"] as const).map((k) => {
        const v = Math.round(Number(fd.get(`price_${k}`)) * 100);
        if (!(v >= 500 && v <= 100_000)) throw new Error(`Enter a price between $5 and $1,000 for ${k}`);
        return [k, v];
      })) as { written: number; voice: number; video: number },
      commission_bps: Math.round(pct * 100),
      deadline_days: Math.min(6, Math.max(1, Number(fd.get("deadline_days")) || 5)), // card holds expire after ~5–7 days
      max_open_requests_per_coach: Math.min(200, Math.max(1, Number(fd.get("max_open")) || 15)),
      retention_days: Math.min(3650, Math.max(30, Number(fd.get("retention_days")) || 365)),
      video_retention_days: Math.min(365, Math.max(1, Number(fd.get("video_retention_days")) || 30)),
      require_admin_review: fd.get("require_admin_review") === "on",
      allow_active_college_coaches: fd.get("allow_active_college_coaches") === "on",
    });
    return "Settings saved. New prices/commission apply to new requests only.";
  }, "/admin/settings");
}

export async function addSpend(_: Result, fd: FormData): Promise<Result> {
  return run(async () => {
    const month = String(fd.get("month") ?? "");
    const amount = Math.round(Number(fd.get("amount")) * 100);
    if (!/^\d{4}-\d{2}$/.test(month) || !(amount >= 0)) throw new Error("Enter month (YYYY-MM) and amount");
    await (await getDeps()).store.addMarketingSpend({ month: `${month}-01`, channel: String(fd.get("channel") || "other").slice(0, 40), amount_cents: amount });
    return "Spend recorded";
  }, "/admin/settings");
}
