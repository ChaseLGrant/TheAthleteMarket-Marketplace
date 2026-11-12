import type { Settings } from "./types";

export interface PriceBreakdown {
  price_cents: number;
  platform_fee_cents: number;
  coach_payout_cents: number;
  estimated_stripe_fee_cents: number;
  estimated_platform_net_cents: number;
}

/** Stripe US card pricing used only for *estimates*; the real fee is read from the balance transaction. */
export function estimateStripeFee(amountCents: number): number {
  return Math.round(amountCents * 0.029) + 30;
}

/**
 * Coach receives price minus commission. The platform absorbs Stripe's processing fee
 * (so at 0% commission during the pilot, the platform's net per evaluation is negative).
 */
export function priceBreakdown(priceCents: number, settings: Pick<Settings, "commission_bps">): PriceBreakdown {
  if (!Number.isInteger(priceCents) || priceCents <= 0) throw new Error("Invalid price");
  const platform_fee_cents = Math.round((priceCents * settings.commission_bps) / 10_000);
  const coach_payout_cents = priceCents - platform_fee_cents;
  const estimated_stripe_fee_cents = estimateStripeFee(priceCents);
  return {
    price_cents: priceCents,
    platform_fee_cents,
    coach_payout_cents,
    estimated_stripe_fee_cents,
    estimated_platform_net_cents: platform_fee_cents - estimated_stripe_fee_cents,
  };
}

export function isValidTier(priceCents: number | null, settings: Pick<Settings, "price_tiers_cents">): boolean {
  return priceCents != null && settings.price_tiers_cents.includes(priceCents);
}
