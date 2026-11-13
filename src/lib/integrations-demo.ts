import { createHmac, randomUUID } from "node:crypto";
import type Stripe from "stripe";
import type { AccountStatus, CheckoutArgs, EmailMessage, Mailer, PaymentDetails, Payments, VideoStorage } from "./integrations";
import { estimateStripeFee } from "./pricing";

/**
 * Simulated Stripe / Resend / Storage for DEMO_MODE and tests.
 * Nothing here talks to the network. These are NOT evidence that the live integrations work.
 */
export class FakePayments implements Payments {
  sessions = new Map<string, CheckoutArgs & { url: string }>();
  refunds: { id: string; paymentIntentId: string; requestId: string }[] = [];
  transfers: { id: string; group: string; amountCents: number; destination: string; reversed: boolean }[] = [];
  accounts = new Map<string, AccountStatus & { coachId: string }>();
  /** PaymentIntent status by id: requires_capture (held) → succeeded (captured) | canceled (released). */
  intents = new Map<string, string>();
  captures: string[] = [];
  releases: string[] = [];
  failCapture = false;
  failRelease = false;
  failTransfers = false;
  failRefunds = false;
  private idem = new Map<string, unknown>();

  private once<T>(key: string, fn: () => T): T {
    if (!this.idem.has(key)) this.idem.set(key, fn());
    return this.idem.get(key) as T;
  }

  async createCheckout(a: CheckoutArgs) {
    return this.once(`checkout-${a.requestId}`, () => {
      const id = `cs_demo_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const url = `/demo/checkout/${id}`;
      this.sessions.set(id, { ...a, url });
      return { id, url };
    });
  }
  /** Simulates the customer completing checkout (card hold placed). */
  authorize(pi: string) { if (!this.intents.has(pi)) this.intents.set(pi, "requires_capture"); }
  private fee(pi: string) {
    const s = [...this.sessions.values()].find((x) => `pi_demo_${x.requestId}` === pi);
    return s ? estimateStripeFee(s.amountCents) : 146;
  }
  async getPaymentDetails(pi: string): Promise<PaymentDetails> {
    const status = this.intents.get(pi) ?? "requires_payment_method";
    return {
      status,
      chargeId: status === "requires_payment_method" ? null : `ch_demo_${pi.slice(8, 20)}`,
      feeCents: status === "succeeded" ? this.fee(pi) : null,
      captureBefore: null,
    };
  }
  async capture(a: { paymentIntentId: string }) {
    if (this.failCapture) throw new Error("Simulated capture failure");
    const st = this.intents.get(a.paymentIntentId);
    if (st === "requires_capture") { this.intents.set(a.paymentIntentId, "succeeded"); this.captures.push(a.paymentIntentId); }
    else if (st !== "succeeded") throw new Error(`Cannot capture payment in status ${st}`);
    return { chargeId: `ch_demo_${a.paymentIntentId.slice(8, 20)}`, feeCents: this.fee(a.paymentIntentId) };
  }
  async releaseHold(a: { paymentIntentId: string }) {
    if (this.failRelease) throw new Error("Simulated release failure");
    const st = this.intents.get(a.paymentIntentId);
    if (st === "canceled") return;
    if (st === "succeeded") throw new Error("Payment was already captured; a refund is required instead");
    this.intents.set(a.paymentIntentId, "canceled");
    this.releases.push(a.paymentIntentId);
  }
  async refund(a: { paymentIntentId: string; requestId: string }) {
    if (this.failRefunds) throw new Error("Simulated refund failure");
    if (this.intents.get(a.paymentIntentId) !== "succeeded") throw new Error("Cannot refund an uncaptured payment");
    return this.once(`refund-${a.requestId}`, () => {
      const r = { id: `re_demo_${this.refunds.length + 1}`, ...a };
      this.refunds.push(r);
      return { id: r.id, status: "succeeded" };
    });
  }
  async findTransferForGroup(group: string) {
    const t = this.transfers.find((x) => x.group === group && !x.reversed);
    return t ? { id: t.id } : null;
  }
  async transfer(a: { requestId: string; amountCents: number; destination: string; group: string }) {
    if (this.failTransfers) throw new Error("Simulated transfer failure");
    return this.once(`transfer-${a.requestId}`, () => {
      const t = { id: `tr_demo_${this.transfers.length + 1}`, group: a.group, amountCents: a.amountCents, destination: a.destination, reversed: false };
      this.transfers.push(t);
      return { id: t.id };
    });
  }
  async reverseTransfer(transferId: string) {
    const t = this.transfers.find((x) => x.id === transferId);
    if (t) t.reversed = true;
    return { id: `trr_demo_${transferId}` };
  }
  async createConnectAccount(a: { coachId: string }) {
    return this.once(`acct-${a.coachId}`, () => {
      const id = `acct_demo_${a.coachId.slice(0, 8)}`;
      this.accounts.set(id, { coachId: a.coachId, payoutsEnabled: false, transfersActive: false, detailsSubmitted: false });
      return { id };
    });
  }
  async createOnboardingLink(a: { accountId: string; returnUrl: string }) {
    return { url: `/demo/onboarding/${a.accountId}?return=${encodeURIComponent(a.returnUrl)}` };
  }
  async createDashboardLink() { return { url: "/demo/inbox" }; }
  async getAccountStatus(accountId: string) {
    const a = this.accounts.get(accountId);
    return a ? { payoutsEnabled: a.payoutsEnabled, transfersActive: a.transfersActive, detailsSubmitted: a.detailsSubmitted }
      : { payoutsEnabled: false, transfersActive: false, detailsSubmitted: false };
  }
  completeOnboarding(accountId: string) {
    const a = this.accounts.get(accountId);
    if (a) Object.assign(a, { payoutsEnabled: true, transfersActive: true, detailsSubmitted: true });
  }
  constructEvent(): Stripe.Event { throw new Error("Webhooks are simulated directly in demo mode"); }
}

export class FakeMailer implements Mailer {
  sent: (EmailMessage & { id: string; at: string })[] = [];
  fail = false;
  private idem = new Map<string, string>();
  async send(m: EmailMessage) {
    if (this.fail) throw new Error("Simulated email failure");
    if (m.idempotencyKey && this.idem.has(m.idempotencyKey)) return { id: this.idem.get(m.idempotencyKey)! };
    const id = `em_demo_${this.sent.length + 1}`;
    this.sent.unshift({ ...m, id, at: new Date().toISOString() });
    if (m.idempotencyKey) this.idem.set(m.idempotencyKey, id);
    return { id };
  }
}

export class FakeVideoStorage implements VideoStorage {
  files = new Map<string, { data: Buffer; mime: string }>();
  constructor(private secret = "demo-storage") {}
  sig(path: string) { return createHmac("sha256", this.secret).update(path).digest("base64url").slice(0, 24); }
  async createUploadUrl(path: string) {
    return { url: `/api/demo/storage?path=${encodeURIComponent(path)}&sig=${this.sig("up:" + path)}` };
  }
  async stat(path: string) {
    const f = this.files.get(path);
    return f ? { size: f.data.length, mime: f.mime } : null;
  }
  async playbackUrl(path: string, _ttl?: number, opts?: { downloadAs?: string }) {
    const dl = opts?.downloadAs ? `&dl=${encodeURIComponent(opts.downloadAs)}` : "";
    return `/api/demo/storage?path=${encodeURIComponent(path)}&sig=${this.sig("get:" + path)}${dl}`;
  }
  async remove(path: string) { this.files.delete(path); }
}
