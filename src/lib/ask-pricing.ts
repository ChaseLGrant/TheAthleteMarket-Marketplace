/** Coach Line pack pricing (shared by server + browser). Returns the total and one price per school. */
export function askPricing(prices: Record<string, number>, n: number): { total: number; each: number[] } {
  const p1 = prices["1"] ?? 2000, p3 = prices["3"] ?? Math.round(p1 * 2.45), p5 = prices["5"] ?? Math.round(p1 * 3.45);
  const total = n >= 5 ? Math.round((p5 / 5) * n) : n >= 3 ? Math.round((p3 / 3) * n) : p1 * n;
  const base = Math.floor(total / Math.max(1, n));
  const each = Array.from({ length: n }, (_, i) => base + (i === 0 ? total - base * n : 0));
  return { total, each };
}
