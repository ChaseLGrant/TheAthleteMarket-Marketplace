import type { Coach, Settings } from "./types";
import { isValidTier } from "./pricing";

export interface GateResult {
  ok: boolean;
  reasons: string[];
}

/**
 * HARD compliance gate. A coach can be offered paid evaluation requests ONLY if every check passes.
 * Enforced on the profile page, the request form, checkout creation, and again before any payout.
 *
 * Active college coaches may be prohibited by NCAA/NAIA/NJCAA/CCCAA rules and their institution from
 * accepting compensation for evaluating prospects. They are blocked unless (a) the platform setting
 * explicitly allows them AND (b) admin has recorded a written authorization reference from both the
 * institution's compliance office and the applicable governing-body interpretation.
 */
export function paidRequestGate(coach: Coach, settings: Settings, now = new Date()): GateResult {
  const reasons: string[] = [];
  if (coach.listing_type !== "participating") reasons.push("Directory listing only — coach has not joined.");
  if (coach.verification_status !== "verified") reasons.push("Coach identity is not verified.");
  if (coach.eligibility_status !== "approved") reasons.push("Compensation eligibility is not approved.");
  if (coach.eligibility_expires_at && new Date(coach.eligibility_expires_at) <= now)
    reasons.push("Eligibility approval has expired and must be re-reviewed.");
  if (!coach.eligibility_basis?.trim()) reasons.push("No documented eligibility basis.");
  if (coach.coach_kind === "active_college") {
    if (!settings.allow_active_college_coaches)
      reasons.push("Active college coaches are disabled platform-wide pending governing-body guidance.");
    if (!coach.authorization_reference?.trim())
      reasons.push("Active college coach has no recorded institutional + governing-body authorization.");
  }
  if (coach.opted_out) reasons.push("Coach has opted out of emails.");
  if (coach.paused) reasons.push("Coach has paused new requests.");
  if (settings.require_payouts_before_booking && !(coach.stripe_transfers_active && coach.stripe_details_submitted))
    reasons.push("Payout setup with Stripe is not complete yet.");
  if (!coach.email) reasons.push("No email address on file.");
  if (!isValidTier(coach.price_cents, settings)) reasons.push("Price is not one of the configured tiers.");
  return { ok: reasons.length === 0, reasons };
}

/** Additional checks before money moves to a coach. */
export function payoutGate(coach: Coach, settings: Settings, now = new Date()): GateResult {
  const base = paidRequestGate(coach, settings, now);
  // Opting out, pausing or a price change never forfeits money already earned.
  const reasons = base.reasons.filter(
    (r) => !r.startsWith("Coach has opted out") && !r.startsWith("Coach has paused") && !r.startsWith("Price is not") && !r.startsWith("Payout setup with Stripe"),
  );
  if (!coach.stripe_account_id) reasons.push("Coach has not started payout setup.");
  else if (!coach.stripe_transfers_active || !coach.stripe_details_submitted)
    reasons.push("Coach payout setup / identity verification is incomplete in Stripe.");
  return { ok: reasons.length === 0, reasons };
}

export function availabilityLabel(coach: Coach, settings: Settings): "available" | "unavailable" | "directory" {
  if (coach.listing_type === "directory") return "directory";
  return paidRequestGate(coach, settings).ok ? "available" : "unavailable";
}
