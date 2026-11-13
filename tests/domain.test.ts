import { describe, expect, it } from "vitest";
import { priceBreakdown } from "@/lib/pricing";
import { paidRequestGate, payoutGate } from "@/lib/compliance";
import { canTransition, sourcesFor } from "@/lib/state-machine";
import { makeToken, verifyToken, makeAdminSession, verifyAdminSession } from "@/lib/tokens";
import { requestSchema, isSafeFilmUrl } from "@/lib/validation";
import { DEFAULT_SETTINGS } from "@/lib/store";
import type { Coach } from "@/lib/types";
import { input } from "./helpers";

const coach = (o: Partial<Coach> = {}): Coach => ({
  id: "c1", slug: "c", full_name: "C", title: null, school: null, sport: "Football", division: null, conference: null,
  state: null, email: "c@example.com", photo_url: null, bio: null, credentials: null, listing_type: "participating",
  coach_kind: "former_college", verification_status: "verified", eligibility_status: "approved",
  eligibility_basis: "former", authorization_reference: null, eligibility_reviewed_at: null, eligibility_expires_at: null,
  price_cents: 4000, stripe_account_id: null, stripe_payouts_enabled: false, stripe_transfers_active: false,
  stripe_details_submitted: false, opted_out: false, is_demo: false, application_message: null,
  created_at: "", updated_at: "", ...o,
});

describe("pricing", () => {
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

describe("compliance gate", () => {
  it("allows a verified, approved former coach", () => {
    expect(paidRequestGate(coach(), DEFAULT_SETTINGS).ok).toBe(true);
  });
  it("blocks directory listings", () => {
    expect(paidRequestGate(coach({ listing_type: "directory" }), DEFAULT_SETTINGS).ok).toBe(false);
  });
  it("blocks active college coaches by default even when approved", () => {
    const g = paidRequestGate(coach({ coach_kind: "active_college", authorization_reference: "letter" }), DEFAULT_SETTINGS);
    expect(g.ok).toBe(false);
  });
  it("active college coaches need setting AND documented authorization", () => {
    const s = { ...DEFAULT_SETTINGS, allow_active_college_coaches: true };
    expect(paidRequestGate(coach({ coach_kind: "active_college" }), s).ok).toBe(false);
    expect(paidRequestGate(coach({ coach_kind: "active_college", authorization_reference: "Compliance letter #12" }), s).ok).toBe(true);
  });
  it("blocks unverified, pending, expired eligibility, missing basis, off-tier price", () => {
    expect(paidRequestGate(coach({ verification_status: "pending" }), DEFAULT_SETTINGS).ok).toBe(false);
    expect(paidRequestGate(coach({ eligibility_status: "pending_review" }), DEFAULT_SETTINGS).ok).toBe(false);
    expect(paidRequestGate(coach({ eligibility_expires_at: "2020-01-01T00:00:00Z" }), DEFAULT_SETTINGS).ok).toBe(false);
    expect(paidRequestGate(coach({ eligibility_basis: " " }), DEFAULT_SETTINGS).ok).toBe(false);
    expect(paidRequestGate(coach({ price_cents: 3500 }), DEFAULT_SETTINGS).ok).toBe(false);
  });
  it("payout requires completed Stripe onboarding", () => {
    expect(payoutGate(coach(), DEFAULT_SETTINGS).ok).toBe(false);
    expect(payoutGate(coach({ stripe_account_id: "acct_1", stripe_transfers_active: true, stripe_details_submitted: true }), DEFAULT_SETTINGS).ok).toBe(true);
  });
  it("opting out of email does not forfeit an earned payout", () => {
    expect(payoutGate(coach({ opted_out: true, stripe_account_id: "a", stripe_transfers_active: true, stripe_details_submitted: true }), DEFAULT_SETTINGS).ok).toBe(true);
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
