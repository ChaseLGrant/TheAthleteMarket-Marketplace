import type { Coach, Settings } from "./types";
import { isValidTier } from "./pricing";

export interface GateResult {
  ok: boolean;
  reasons: string[];
}

/**
 * Can a family send this coach a paid request? Open marketplace: no admin approval.
 * Only practical/legal blockers remain (no email, opted out, removed, paused, unconfirmed self-signup).
 * Price is chosen at checkout (coach's own price, or the family's offer from the configured tiers).
 */
export function paidRequestGate(coach: Coach, settings: Settings, _now = new Date()): GateResult {
  const reasons: string[] = [];
  if (coach.removed) reasons.push("This listing has been removed.");
  if (!coach.email) reasons.push("We don't have an email address for this coach yet.");
  if (coach.opted_out) reasons.push("This coach has asked not to receive requests.");
  if (coach.email_status && coach.email_status !== "ok") reasons.push("We couldn't reach this coach by email.");
  if (coach.paused) reasons.push("Coach has paused new requests.");
  if (coach.source === "self" && !coach.email_confirmed_at) reasons.push("Coach hasn't confirmed their email yet.");
  if (coach.coach_kind === "active_college" && !settings.allow_active_college_coaches)
    reasons.push("Current college coaches are switched off in Admin → Settings.");
  if (settings.require_payouts_before_booking && !(coach.stripe_transfers_active && coach.stripe_details_submitted))
    reasons.push("Payout setup with Stripe is not complete yet.");
  return { ok: reasons.length === 0, reasons };
}

/** The coach's own price if valid; otherwise the family chooses an offer from the tiers. */
export function resolvePrice(coach: Coach, settings: Settings, offerCents?: number | null): number | null {
  if (isValidTier(coach.price_cents, settings)) return coach.price_cents;
  if (offerCents != null && isValidTier(offerCents, settings)) return offerCents;
  if (settings.price_tiers_cents.length === 1) return settings.price_tiers_cents[0]!;
  return null;
}
export function familyChoosesOffer(coach: Coach, settings: Settings): boolean {
  return settings.price_tiers_cents.length > 1 && !isValidTier(coach.price_cents, settings);
}

/** Loose name match: same last name (handles Mike/Michael, middle names, suffixes). */
export function namesMatch(profile: string, legal: string): boolean {
  const last = (s: string) =>
    s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "")
      .replace(/[^a-z\s-]/g, "").trim().split(/\s+/).pop() ?? "";
  return !!last(profile) && last(profile) === last(legal);
}

/** Before money moves: Stripe has verified the coach's identity, and that identity matches the profile. */
export function payoutGate(coach: Coach, _settings: Settings, _now = new Date()): GateResult {
  const reasons: string[] = [];
  if (coach.removed) reasons.push("Listing removed — review before paying.");
  if (!coach.stripe_account_id) reasons.push("Coach has not started payout setup.");
  else if (!coach.stripe_transfers_active || !coach.stripe_details_submitted)
    reasons.push("Coach payout setup / identity verification is incomplete in Stripe.");
  if (coach.stripe_legal_name && !coach.name_match_override && !namesMatch(coach.full_name, coach.stripe_legal_name))
    reasons.push(`Name check: Stripe-verified name "${coach.stripe_legal_name}" doesn't match profile "${coach.full_name}".`);
  return { ok: reasons.length === 0, reasons };
}

/** "joined" = coach is on the platform; "invite" = we'll email them the request; "unavailable" = can't request. */
export function availabilityLabel(coach: Coach, settings: Settings): "joined" | "invite" | "unavailable" {
  if (!paidRequestGate(coach, settings).ok) return "unavailable";
  return coach.listing_type === "participating" && (coach.stripe_transfers_active || !!coach.email_confirmed_at) ? "joined" : "invite";
}
