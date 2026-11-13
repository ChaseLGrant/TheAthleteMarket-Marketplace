import type { Coach } from "../types";

// ---------------------------------------------------------------------------
// Public coach stats
// ---------------------------------------------------------------------------
export function deliveryBadge(c: Pick<Coach, "delivered_count" | "delivery_hours_total">): string | null {
  if (c.delivered_count < 3) return null;
  const hrs = Number(c.delivery_hours_total) / c.delivered_count;
  if (hrs < 24) return "Usually delivers within a day";
  const days = Math.round(hrs / 24);
  return `Usually delivers in ~${days} day${days === 1 ? "" : "s"}`;
}
export function ratingBadge(c: Pick<Coach, "rating_sum" | "rating_count">): { avg: string; count: number } | null {
  if (c.rating_count < 3) return null;
  return { avg: (c.rating_sum / c.rating_count).toFixed(1), count: c.rating_count };
}
