import { describe, expect, it } from "vitest";
import { priceBreakdown } from "@/lib/pricing";
import { paidRequestGate, payoutGate } from "@/lib/compliance";
import { canTransition, sourcesFor } from "@/lib/state-machine";
import { makeToken, verifyToken, makeAdminSession, verifyAdminSession } from "@/lib/tokens";
import { requestSchema, isSafeFilmUrl } from "@/lib/validation";
import { DEFAULT_SETTINGS as PROD_SETTINGS } from "@/lib/store";
const DEFAULT_SETTINGS = { ...PROD_SETTINGS, require_payouts_before_booking: false };
import type { Coach } from "@/lib/types";
import { input } from "./helpers";

const coach = (o: Partial<Coach> = {}): Coach => ({
  id: "c1", slug: "c", full_name: "C", title: null, school: null, sport: "Football", division: null, conference: null,
  state: null, email: "c@example.com", photo_url: null, bio: null, credentials: null, listing_type: "participating",
  coach_kind: "former_college", verification_status: "verified", eligibility_status: "approved",
  eligibility_basis: "former", authorization_reference: null, eligibility_reviewed_at: null, eligibility_expires_at: null,
  price_cents: 4000, stripe_account_id: null, stripe_payouts_enabled: false, stripe_transfers_active: false,
  stripe_details_submitted: false, opted_out: false, is_demo: false, application_message: null,
  phone: null, sms_opt_in_at: null, sms_opted_out: false, paused: false, intro_video_path: null, delivered_count: 0,
  delivery_hours_total: 0, rating_sum: 0, rating_count: 0, payout_invite_sent_at: null, last_summary_at: null,
  email_confirmed_at: null, source: "import", unlisted: false, removed: false, stripe_legal_name: null,
  name_match_override: false, requests_received: 0, email_status: "ok", camps: [], events: [], answers_count: 0,
  answer_hours_total: 0, line_slug: null,
  created_at: "", updated_at: "", ...o,
});

describe("pricing", () => {
  it("launch defaults: $50 price, 20% to the platform → coach $40, platform $10 before Stripe's fee", () => {
    expect(PROD_SETTINGS.price_tiers_cents).toEqual([5000]);
    const b = priceBreakdown(5000, PROD_SETTINGS);
    expect(b.coach_payout_cents).toBe(4000);
    expect(b.platform_fee_cents).toBe(1000);
    expect(b.estimated_stripe_fee_cents).toBe(175);
    expect(b.estimated_platform_net_cents).toBe(825);
    expect(resolvePrice(coach({ price_cents: null }), PROD_SETTINGS)).toBe(5000);
  });
  it("pilot: 0% commission, coach gets full listed amount, platform absorbs Stripe fee", () => {
    const b = priceBreakdown(4000, { commission_bps: 0 });
    expect(b.coach_payout_cents).toBe(4000);
    expect(b.platform_fee_cents).toBe(0);
    expect(b.estimated_stripe_fee_cents).toBe(146);
    expect(b.estimated_platform_net_cents).toBe(-146);
  });
  it("later: 20% take rate", () => {
    const b = priceBreakdown(5000, { commission_bps: 2000 });
    expect(b.platform_fee_cents).toBe(1000);
    expect(b.coach_payout_cents).toBe(4000);
  });
  it("rejects invalid prices", () => {
    expect(() => priceBreakdown(0, { commission_bps: 0 })).toThrow();
  });
});

import { availabilityLabel, namesMatch, resolvePrice } from "@/lib/compliance";

describe("open marketplace: who can be requested", () => {
  it("ANY coach with an email can be requested — no approval, no Stripe setup needed first", () => {
    const directory = coach({ listing_type: "directory", verification_status: "unverified", eligibility_status: "not_reviewed", price_cents: null });
    expect(paidRequestGate(directory, PROD_SETTINGS).ok).toBe(true);
    expect(availabilityLabel(directory, PROD_SETTINGS)).toBe("invite");
    expect(paidRequestGate(coach({ coach_kind: "active_college" }), PROD_SETTINGS).ok).toBe(true);
    expect(paidRequestGate(coach({ coach_kind: "pro_player", division: "Professional" }), PROD_SETTINGS).ok).toBe(true);
  });
  it("blocks only: no email, opted out, removed, paused, unconfirmed self-signup", () => {
    expect(paidRequestGate(coach({ email: null }), PROD_SETTINGS).ok).toBe(false);
    expect(paidRequestGate(coach({ opted_out: true }), PROD_SETTINGS).ok).toBe(false);
    expect(paidRequestGate(coach({ removed: true }), PROD_SETTINGS).ok).toBe(false);
    expect(paidRequestGate(coach({ paused: true }), PROD_SETTINGS).ok).toBe(false);
    expect(paidRequestGate(coach({ source: "self" }), PROD_SETTINGS).ok).toBe(false);
    expect(paidRequestGate(coach({ source: "self", email_confirmed_at: "2026-11-01T00:00:00Z" }), PROD_SETTINGS).ok).toBe(true);
  });
  it("joined = confirmed email or payouts set up", () => {
    expect(availabilityLabel(coach({ source: "self", email_confirmed_at: "x" }), PROD_SETTINGS)).toBe("joined");
    expect(availabilityLabel(coach({ stripe_transfers_active: true }), PROD_SETTINGS)).toBe("joined");
  });
  it("price (multi-tier mode): the coach's own price, else the family's offer from the tiers", () => {
    const multi = { ...PROD_SETTINGS, price_tiers_cents: [3000, 4000, 5000] };
    expect(resolvePrice(coach({ price_cents: 4000 }), multi, 5000)).toBe(4000);
    expect(resolvePrice(coach({ price_cents: null }), multi, 5000)).toBe(5000);
    expect(resolvePrice(coach({ price_cents: null }), multi, 9900)).toBeNull();
    expect(resolvePrice(coach({ price_cents: null }), multi)).toBeNull();
  });
  it("payout requires Stripe identity, and the verified name must match the profile (impostor check)", () => {
    const ready = { stripe_account_id: "a", stripe_transfers_active: true, stripe_details_submitted: true };
    expect(payoutGate(coach(), PROD_SETTINGS).ok).toBe(false);
    expect(payoutGate(coach({ ...ready, full_name: "Michael Jordan", stripe_legal_name: "Mike Jordan" }), PROD_SETTINGS).ok).toBe(true);
    expect(payoutGate(coach({ ...ready, full_name: "Nick Saban", stripe_legal_name: "Random Person" }), PROD_SETTINGS).ok).toBe(false);
    expect(payoutGate(coach({ ...ready, full_name: "Nick Saban", stripe_legal_name: "Random Person", name_match_override: true }), PROD_SETTINGS).ok).toBe(true);
    expect(payoutGate(coach({ ...ready, opted_out: true, paused: true, price_cents: null }), PROD_SETTINGS).ok).toBe(true);
  });
  it("name matching tolerates nicknames, middle names and suffixes", () => {
    expect(namesMatch("Chris Nakamura", "Christopher J Nakamura")).toBe(true);
    expect(namesMatch("Derek Hampton Jr.", "Derek Hampton")).toBe(true);
    expect(namesMatch("José Reyes", "Jose Reyes")).toBe(true);
    expect(namesMatch("Pat Coach", "Pat Smith")).toBe(false);
  });
});

describe("state machine", () => {
  it("never allows paying out from declined/expired, or leaving terminal states", () => {
    expect(canTransition("declined", "completed")).toBe(false);
    expect(canTransition("expired", "submitted")).toBe(false);
    expect(canTransition("refunded", "completed")).toBe(false);
    expect(canTransition("cancelled", "paid")).toBe(false);
    expect(sourcesFor("submitted").sort()).toEqual(["accepted", "coach_notified"]);
  });
});

describe("tokens", () => {
  it("verifies and rejects tampering / rotated nonces", () => {
    const t = makeToken("coach", "abc", "n1");
    expect(verifyToken("coach", t, "n1")).toBe(true);
    expect(verifyToken("coach", t, "n2")).toBe(false);
    expect(verifyToken("delivery", t, "n1")).toBe(false);
    expect(verifyToken("coach", t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"), "n1")).toBe(false);
  });
  it("admin sessions expire", () => {
    expect(verifyAdminSession(makeAdminSession())).toBe(true);
    expect(verifyAdminSession(makeAdminSession(-1000))).toBe(false);
    expect(verifyAdminSession("123.abc")).toBe(false);
  });
});

describe("validation", () => {
  // Shape of real FormData: strings, empty strings for blank optional fields.
  const raw = (o: Record<string, unknown> = {}) => ({
    ...Object.fromEntries(Object.entries(input()).map(([k, v]) => [k, v ?? ""])),
    gradYear: "2028", company: "", ...o,
  });
  it("accepts a valid minor request with guardian consent", () => {
    expect(requestSchema.safeParse(raw()).success).toBe(true);
  });
  it("requires guardian consent and a parent purchaser for minors", () => {
    expect(requestSchema.safeParse(raw({ guardianConsent: undefined })).success).toBe(false);
    expect(requestSchema.safeParse(raw({ relationship: "athlete_adult" })).success).toBe(false);
  });
  it("adult athletes can buy for themselves", () => {
    expect(requestSchema.safeParse(raw({ athleteIsMinor: "no", relationship: "athlete_adult", guardianConsent: undefined })).success).toBe(true);
  });
  it("only https film links, no internal hosts", () => {
    expect(isSafeFilmUrl("https://youtu.be/x")).toBe(true);
    expect(isSafeFilmUrl("http://youtu.be/x")).toBe(false);
    expect(isSafeFilmUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeFilmUrl("https://localhost/x")).toBe(false);
  });
  it("honeypot rejects bots", () => {
    expect(requestSchema.safeParse(raw({ company: "spam" })).success).toBe(false);
  });
});

import { filmEmbedUrl } from "@/lib/film";
describe("film embeds", () => {
  it("embeds YouTube/Vimeo, links everything else", () => {
    expect(filmEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(filmEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toContain("dQw4w9WgXcQ");
    expect(filmEmbedUrl("https://vimeo.com/123456")).toContain("player.vimeo.com/video/123456");
    expect(filmEmbedUrl("https://www.hudl.com/video/3/123")).toBeNull();
  });
});
