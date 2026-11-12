import type Stripe from "stripe";
import type { Deps } from "../deps";
import { log } from "../log";
import { alertAdmin } from "./notify";
import {
  handleAccountUpdated, handleChargeRefunded, handleCheckoutExpired, handleCheckoutPaid, handleDispute,
} from "./lifecycle";

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

/**
 * Process a verified Stripe event exactly once (ledger in `stripe_events`). If processing throws,
 * the event stays unfinished, we return 500, and Stripe retries; handlers are idempotent so a
 * partially-applied event is safe to replay.
 */
export async function processStripeEvent(deps: Deps, evt: Stripe.Event): Promise<"processed" | "duplicate"> {
  const claim = await deps.store.claimStripeEvent(evt.id, evt.type);
  if (claim === "done") return "duplicate";
  try {
    await dispatch(deps, evt);
    await deps.store.finishStripeEvent(evt.id);
    return "processed";
  } catch (e) {
    await deps.store.finishStripeEvent(evt.id, String(e).slice(0, 500));
    throw e;
  }
}

async function dispatch(deps: Deps, evt: Stripe.Event) {
  switch (evt.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = evt.data.object;
      await handleCheckoutPaid(deps, {
        id: s.id,
        payment_status: s.payment_status,
        payment_intent: idOf(s.payment_intent),
        client_reference_id: s.client_reference_id,
        amount_total: s.amount_total,
        metadata: s.metadata,
      });
      return;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const s = evt.data.object;
      await handleCheckoutExpired(deps, { id: s.id, client_reference_id: s.client_reference_id });
      return;
    }
    case "charge.refunded": {
      const c = evt.data.object;
      await handleChargeRefunded(deps, { id: c.id, payment_intent: idOf(c.payment_intent), refunded: c.refunded });
      return;
    }
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      const d = evt.data.object;
      await handleDispute(deps, {
        id: d.id, charge: idOf(d.charge), payment_intent: idOf(d.payment_intent ?? null),
        amount: d.amount, reason: d.reason ?? null, status: d.status,
      });
      return;
    }
    case "account.updated": {
      await handleAccountUpdated(deps, evt.data.object.id);
      return;
    }
    case "payout.failed": {
      // Connected-account event: the coach's bank rejected a payout from their Stripe balance.
      const p = evt.data.object;
      await alertAdmin(deps, "Coach bank payout failed", [
        `Account ${evt.account ?? "unknown"}: ${p.failure_message ?? p.failure_code ?? "unknown reason"}`,
        "Stripe will email the coach to update their bank details; funds stay in their Stripe balance.",
      ]);
      return;
    }
    case "transfer.reversed": {
      const t = evt.data.object;
      const reqId = t.metadata?.request_id;
      if (reqId) await deps.store.casRequest(reqId, { payout_status: ["paid"] }, { payout_status: "reversed" });
      return;
    }
    default:
      log("info", "stripe event ignored", { type: evt.type });
  }
}
