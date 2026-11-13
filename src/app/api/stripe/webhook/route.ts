import { json } from "@/lib/api";
import { getDeps } from "@/lib/deps";
import { log } from "@/lib/log";
import { processStripeEvent } from "@/lib/services/webhooks";

export const maxDuration = 60;

/**
 * Stripe webhook (platform + Connect events). Point BOTH endpoints in the Stripe Dashboard at this URL;
 * the signature is checked against STRIPE_WEBHOOK_SECRET and STRIPE_CONNECT_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "missing signature" }, 400);
  const raw = await req.text();
  const deps = await getDeps();
  let evt;
  try {
    evt = deps.payments.constructEvent(raw, sig);
  } catch (e) {
    log("warn", "stripe signature verification failed", { error: String(e) });
    return json({ error: "invalid signature" }, 400);
  }
  try {
    const result = await processStripeEvent(deps, evt);
    return json({ received: true, result });
  } catch (e) {
    log("error", "stripe webhook processing failed", { id: evt.id, type: evt.type, error: String(e) });
    return json({ error: "processing failed" }, 500); // Stripe retries with backoff
  }
}
