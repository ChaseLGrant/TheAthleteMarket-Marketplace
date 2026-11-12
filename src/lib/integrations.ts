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
  getPaymentDetails(paymentIntentId: string): Promise<{ chargeId: string | null; feeCents: number | null }>;
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
}

export interface AccountStatus {
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
}
export interface Mailer {
  send(m: EmailMessage): Promise<{ id: string }>;
}

export interface VideoStorage {
  createUploadUrl(path: string): Promise<{ url: string }>;
  stat(path: string): Promise<{ size: number; mime: string | null } | null>;
  playbackUrl(path: string, ttlSeconds: number): Promise<string>;
  remove(path: string): Promise<void>;
}
