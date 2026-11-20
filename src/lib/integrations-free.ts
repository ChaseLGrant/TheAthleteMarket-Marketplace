import type Stripe from "stripe";
import { env } from "./env";
import type { AccountStatus, CheckoutArgs, Payments, PaymentDetails } from "./integrations";

/**
 * PAYMENTS OFF: no Stripe, no card, no charges. Every "checkout" completes instantly and every "hold" is a no-op,
 * so the whole message → answer → reply flow runs for free. Turn payments on by adding STRIPE_SECRET_KEY
 * (and removing PAYMENTS_OFF).
 */
export class FreePayments implements Payments {
  private url(kind: "ask" | "eval", id: string) {
    return `${env.siteUrl()}/api/free/complete?kind=${kind}&id=${encodeURIComponent(id)}`;
  }
  async createCheckout(a: CheckoutArgs) {
    const id = `free_cs_${a.requestId}`;
    return { id, url: this.url("eval", id) };
  }
  async getPaymentDetails(): Promise<PaymentDetails> {
    return { status: "requires_capture", chargeId: null, feeCents: 0, captureBefore: null }; // a $0 "hold": nothing charged
  }
  async capture() { return { chargeId: null, feeCents: 0 }; }
  async releaseHold() {}
  async refund(a: { requestId: string }) { return { id: `free_re_${a.requestId}`, status: "succeeded" }; }
  async findTransferForGroup() { return null; }
  async transfer(): Promise<{ id: string }> { throw new Error("Payments are off — no coach transfers."); }
  async reverseTransfer(): Promise<{ id: string }> { throw new Error("Payments are off."); }
  async createConnectAccount(): Promise<{ id: string }> { throw new Error("Payments are off — payouts aren't available yet."); }
  async createOnboardingLink(): Promise<{ url: string }> { throw new Error("Payments are off — payouts aren't available yet."); }
  async createDashboardLink(): Promise<{ url: string }> { throw new Error("Payments are off."); }
  async getAccountStatus(): Promise<AccountStatus> { return { payoutsEnabled: false, transfersActive: false, detailsSubmitted: false }; }
  constructEvent(): Stripe.Event { throw new Error("Payments are off — Stripe webhooks are not used."); }
  async createSetupCheckout(a: { orderId: string }) {
    const id = `free_setup_${a.orderId}`;
    return { id, url: this.url("ask", id), customerId: "free" };
  }
  async getSetupDetails() { return { customerId: "free", paymentMethodId: "free" }; }
  async holdOffSession(a: { requestId: string }) {
    return { paymentIntentId: `free_pi_${a.requestId}`, status: "requires_capture", chargeId: null, captureBefore: null };
  }
}
