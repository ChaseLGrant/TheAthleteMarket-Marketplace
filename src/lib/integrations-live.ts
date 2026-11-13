import Stripe from "stripe";
import { env } from "./env";
import type { AccountStatus, CheckoutArgs, EmailMessage, Mailer, PaymentDetails, Payments, VideoStorage } from "./integrations";
import { supabaseAdmin } from "./store-supabase";

let stripeClient: Stripe | null = null;
export function stripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(env.stripeSecretKey(), {
      maxNetworkRetries: 2,
      appInfo: { name: "TheAthleteMarket-Marketplace" },
    });
  }
  return stripeClient;
}

export class StripePayments implements Payments {
  async createCheckout(a: CheckoutArgs) {
    const s = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: a.requestId,
        customer_email: a.customerEmail,
        submit_type: "pay",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: a.currency,
              unit_amount: a.amountCents,
              product_data: { name: a.productName, description: a.description },
            },
          },
        ],
        payment_intent_data: {
          // Place a hold only. We capture when the coach delivers, and release the hold otherwise,
          // so declined/expired requests never incur a Stripe processing fee.
          capture_method: "manual",
          description: `${a.productName} (${a.ref})`,
          transfer_group: `req_${a.requestId}`,
          metadata: { request_id: a.requestId, ref: a.ref, coach_id: a.coachId },
        },
        metadata: { request_id: a.requestId, ref: a.ref },
        custom_text: {
          submit: {
            message:
              "Your card is only authorized now. You're charged only when your video is delivered — if the coach declines or runs out of time, the hold is released. An evaluation is feedback only, not a recruiting offer.",
          },
        },
        success_url: a.successUrl,
        cancel_url: a.cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
      },
      { idempotencyKey: `checkout-${a.requestId}` },
    );
    if (!s.url) throw new Error("Stripe did not return a Checkout URL");
    return { id: s.id, url: s.url };
  }

  async getPaymentDetails(paymentIntentId: string): Promise<PaymentDetails> {
    const pi = await stripe().paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = pi.latest_charge as Stripe.Charge | null;
    const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null | undefined;
    const cb = charge?.payment_method_details?.card?.capture_before;
    return {
      status: pi.status,
      chargeId: charge?.id ?? null,
      feeCents: bt && typeof bt === "object" ? bt.fee : null,
      captureBefore: cb ? new Date(cb * 1000) : null,
    };
  }

  async capture(a: { paymentIntentId: string; requestId: string }) {
    const current = await stripe().paymentIntents.retrieve(a.paymentIntentId);
    if (current.status === "requires_capture") {
      await stripe().paymentIntents.capture(a.paymentIntentId, {}, { idempotencyKey: `capture-${a.requestId}` });
    } else if (current.status !== "succeeded") {
      throw new Error(`Cannot capture payment in status ${current.status}`);
    }
    const d = await this.getPaymentDetails(a.paymentIntentId);
    return { chargeId: d.chargeId, feeCents: d.feeCents };
  }

  async releaseHold(a: { paymentIntentId: string; requestId: string }) {
    const pi = await stripe().paymentIntents.retrieve(a.paymentIntentId);
    if (pi.status === "canceled") return; // already released, or the hold lapsed on its own
    if (pi.status === "succeeded") throw new Error("Payment was already captured; a refund is required instead");
    await stripe().paymentIntents.cancel(
      a.paymentIntentId,
      { cancellation_reason: "abandoned" },
      { idempotencyKey: `release-${a.requestId}` },
    );
  }

  async refund(a: { paymentIntentId: string; requestId: string; reason: string }) {
    const r = await stripe().refunds.create(
      {
        payment_intent: a.paymentIntentId,
        reason: "requested_by_customer",
        metadata: { request_id: a.requestId, internal_reason: a.reason.slice(0, 450) },
      },
      { idempotencyKey: `refund-${a.requestId}` },
    );
    return { id: r.id, status: r.status ?? "pending" };
  }

  async findTransferForGroup(group: string) {
    const list = await stripe().transfers.list({ transfer_group: group, limit: 5 });
    const live = list.data.find((t) => !t.reversed);
    return live ? { id: live.id } : null;
  }

  async transfer(a: {
    requestId: string; amountCents: number; currency: string; destination: string;
    sourceTransaction: string | null; group: string;
  }) {
    const t = await stripe().transfers.create(
      {
        amount: a.amountCents,
        currency: a.currency,
        destination: a.destination,
        transfer_group: a.group,
        // Ties the transfer to the original charge so it waits for those funds to be available.
        ...(a.sourceTransaction ? { source_transaction: a.sourceTransaction } : {}),
        description: "The Athlete Market evaluation payout",
        metadata: { request_id: a.requestId },
      },
      { idempotencyKey: `transfer-${a.requestId}` },
    );
    return { id: t.id };
  }

  async reverseTransfer(transferId: string, requestId: string) {
    const r = await stripe().transfers.createReversal(
      transferId,
      { metadata: { request_id: requestId } },
      { idempotencyKey: `reversal-${requestId}` },
    );
    return { id: r.id };
  }

  async createConnectAccount(a: { coachId: string; email: string; name: string }) {
    const acct = await stripe().accounts.create(
      {
        type: "express",
        country: "US",
        email: a.email,
        business_type: "individual",
        capabilities: { transfers: { requested: true } },
        business_profile: {
          product_description: "Recorded video feedback on athlete highlight film via The Athlete Market",
        },
        metadata: { coach_id: a.coachId },
      },
      { idempotencyKey: `acct-${a.coachId}` },
    );
    return { id: acct.id };
  }

  async createOnboardingLink(a: { accountId: string; refreshUrl: string; returnUrl: string }) {
    const link = await stripe().accountLinks.create({
      account: a.accountId,
      type: "account_onboarding",
      refresh_url: a.refreshUrl,
      return_url: a.returnUrl,
    });
    return { url: link.url };
  }

  async createDashboardLink(accountId: string) {
    const l = await stripe().accounts.createLoginLink(accountId);
    return { url: l.url };
  }

  async getAccountStatus(accountId: string): Promise<AccountStatus> {
    const a = await stripe().accounts.retrieve(accountId);
    return {
      payoutsEnabled: !!a.payouts_enabled,
      transfersActive: a.capabilities?.transfers === "active",
      detailsSubmitted: !!a.details_submitted,
    };
  }

  constructEvent(rawBody: string, signature: string) {
    const secrets = env.stripeWebhookSecrets();
    if (!secrets.length) throw new Error("No Stripe webhook secret configured");
    let lastErr: unknown;
    for (const secret of secrets) {
      try {
        return stripe().webhooks.constructEvent(rawBody, signature, secret);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }
}

export class ResendMailer implements Mailer {
  async send(m: EmailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey()}`,
        "Content-Type": "application/json",
        ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: env.emailFrom(),
        to: [m.to],
        subject: m.subject,
        html: m.html,
        text: m.text,
        ...(env.emailReplyTo() ? { reply_to: env.emailReplyTo() } : {}),
        ...(m.headers ? { headers: m.headers } : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? "unknown error"}`);
    return { id: body.id };
  }
}

export class SupabaseVideoStorage implements VideoStorage {
  private bucket() {
    return supabaseAdmin().storage.from(env.videoBucket());
  }
  async createUploadUrl(path: string) {
    const r = await this.bucket().createSignedUploadUrl(path, { upsert: true });
    if (r.error || !r.data) throw new Error(`storage upload url: ${r.error?.message}`);
    return { url: r.data.signedUrl };
  }
  async stat(path: string) {
    const dir = path.slice(0, path.lastIndexOf("/"));
    const name = path.slice(path.lastIndexOf("/") + 1);
    const r = await this.bucket().list(dir, { search: name, limit: 5 });
    if (r.error) throw new Error(`storage stat: ${r.error.message}`);
    const f = r.data?.find((x) => x.name === name);
    if (!f) return null;
    const meta = (f.metadata ?? {}) as { size?: number; mimetype?: string };
    return { size: Number(meta.size ?? 0), mime: meta.mimetype ?? null };
  }
  async playbackUrl(path: string, ttlSeconds: number) {
    const r = await this.bucket().createSignedUrl(path, ttlSeconds);
    if (r.error || !r.data) throw new Error(`storage signed url: ${r.error?.message}`);
    return r.data.signedUrl;
  }
  async remove(path: string) {
    const r = await this.bucket().remove([path]);
    if (r.error) throw new Error(`storage remove: ${r.error.message}`);
  }
}
