import type Stripe from "stripe";

/** Thin interfaces over external services so business logic is testable and demo-able. */

export interface CheckoutArgs {
  requestId: string;
  ref: string;
  coachId: string;
  amountCents: number;
  currency: string;
  productName: string;
  description: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface Payments {
  createCheckout(a: CheckoutArgs): Promise<{ id: string; url: string }>;
  /** Status of the PaymentIntent behind a checkout. `requires_capture` = card hold placed. */
  getPaymentDetails(paymentIntentId: string): Promise<PaymentDetails>;
  /** Charge the held card (on delivery). Idempotent. */
  capture(a: { paymentIntentId: string; requestId: string }): Promise<{ chargeId: string | null; feeCents: number | null }>;
  /** Release an uncaptured hold. No charge, so no Stripe fee. Idempotent; OK if the hold already lapsed. */
  releaseHold(a: { paymentIntentId: string; requestId: string }): Promise<void>;
  /** Refund a CAPTURED payment (Stripe keeps its fee). Admin-only situations. */
  refund(a: { paymentIntentId: string; requestId: string; reason: string }): Promise<{ id: string; status: string }>;
  findTransferForGroup(group: string): Promise<{ id: string } | null>;
  transfer(a: {
    requestId: string; amountCents: number; currency: string; destination: string;
    sourceTransaction: string | null; group: string;
  }): Promise<{ id: string }>;
  reverseTransfer(transferId: string, requestId: string): Promise<{ id: string }>;
  createConnectAccount(a: { coachId: string; email: string; name: string }): Promise<{ id: string }>;
  createOnboardingLink(a: { accountId: string; refreshUrl: string; returnUrl: string }): Promise<{ url: string }>;
  createDashboardLink(accountId: string): Promise<{ url: string }>;
  getAccountStatus(accountId: string): Promise<AccountStatus>;
  constructEvent(rawBody: string, signature: string): Stripe.Event;

  // ---- Coach Line: save the card once, then one hold per school (charged only if that school answers)
  createSetupCheckout(a: { orderId: string; ref: string; customerEmail: string; customerName: string; description: string; successUrl: string; cancelUrl: string }): Promise<{ id: string; url: string; customerId: string }>;
  getSetupDetails(sessionId: string): Promise<{ customerId: string; paymentMethodId: string }>;
  holdOffSession(a: { requestId: string; amountCents: number; customerId: string; paymentMethodId: string; description: string }): Promise<{ paymentIntentId: string; status: string; chargeId: string | null; captureBefore: Date | null }>;
}

export interface PaymentDetails {
  status: string; // requires_capture | succeeded | canceled | requires_payment_method | ...
  chargeId: string | null;
  feeCents: number | null;
  /** Latest moment the hold can be captured (from the card network), if known. */
  captureBefore: Date | null;
}

export interface AccountStatus {
  /** Stripe-verified legal name of the individual, when Stripe shares it with the platform. */
  legalName?: string | null;
  payoutsEnabled: boolean;
  transfersActive: boolean;
  detailsSubmitted: boolean;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  /** Per-message Reply-To (e.g. the request's private reply address). */
  replyTo?: string;
  /** "coach" = email to a coach: sent from the real Microsoft 365 mailbox when configured (school email trusts it). */
  audience?: "coach" | "family";
}
export interface Mailer {
  send(m: EmailMessage): Promise<{ id: string }>;
}

export interface SmsMessage {
  to: string; // E.164
  body: string;
}
export interface Sms {
  /** false when Twilio isn't configured: callers skip texting and rely on email. */
  readonly enabled: boolean;
  /** Throws SmsOptedOutError if the recipient replied STOP. */
  send(m: SmsMessage): Promise<{ id: string }>;
}
export class SmsOptedOutError extends Error {}

export interface VideoStorage {
  createUploadUrl(path: string): Promise<{ url: string }>;
  stat(path: string): Promise<{ size: number; mime: string | null } | null>;
  /** Short-lived signed URL. With `downloadAs`, the browser saves the file instead of playing it. */
  playbackUrl(path: string, ttlSeconds: number, opts?: { downloadAs?: string }): Promise<string>;
  remove(path: string): Promise<void>;
}
