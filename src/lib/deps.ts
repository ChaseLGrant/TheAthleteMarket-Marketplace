import { isDemoMode, paymentsOff } from "./env";
import type { Mailer, Payments, Sms, VideoStorage } from "./integrations";
import type { Store } from "./store";

export interface Deps {
  store: Store;
  payments: Payments;
  mailer: Mailer;
  storage: VideoStorage;
  sms: Sms;
  now: () => Date;
}

type DemoBundle = Deps & {
  clockOffsetMs: number;
  store: import("./store-memory").MemoryStore;
  payments: import("./integrations-demo").FakePayments;
  mailer: import("./integrations-demo").FakeMailer;
  storage: import("./integrations-demo").FakeVideoStorage;
  sms: import("./integrations-demo").FakeSms;
};

const g = globalThis as unknown as { __tamDemo?: Promise<DemoBundle>; __tamLive?: Deps };

export async function getDemo(): Promise<DemoBundle> {
  if (!g.__tamDemo) {
    g.__tamDemo = (async () => {
      const [{ MemoryStore }, demo, { seedDemo }] = await Promise.all([
        import("./store-memory"),
        import("./integrations-demo"),
        import("./demo-seed"),
      ]);
      const store = new MemoryStore();
      await seedDemo(store);
      const bundle: DemoBundle = {
        clockOffsetMs: 0,
        store,
        // PAYMENTS_OFF=1 in demo exercises the free flow (no card step) end to end.
        payments: (paymentsOff() ? new (await import("./integrations-free")).FreePayments() : new demo.FakePayments()) as InstanceType<typeof demo.FakePayments>,
        mailer: new demo.FakeMailer(),
        storage: new demo.FakeVideoStorage(),
        sms: new demo.FakeSms(),
        now: () => new Date(Date.now() + bundle.clockOffsetMs),
      };
      // Demo coaches have already finished payout setup (as real coaches will, at sign-up),
      // and videos are delivered instantly so the demo can be clicked straight through.
      await store.updateSettings({ require_admin_review: false });
      for (const c of paymentsOff() ? [] : await store.listParticipatingCoaches()) {
        const { id } = await bundle.payments.createConnectAccount({ coachId: c.id, email: c.email ?? "", name: c.full_name });
        bundle.payments.completeOnboarding(id);
        await store.updateCoach(c.id, { stripe_account_id: id, stripe_transfers_active: true, stripe_details_submitted: true, stripe_payouts_enabled: true });
      }
      return bundle;
    })();
  }
  return g.__tamDemo;
}

export async function getDeps(): Promise<Deps> {
  if (isDemoMode()) return getDemo();
  if (!g.__tamLive) {
    const [{ SupabaseStore }, live] = await Promise.all([import("./store-supabase"), import("./integrations-live")]);
    g.__tamLive = {
      store: new SupabaseStore(),
      payments: paymentsOff() ? new (await import("./integrations-free")).FreePayments() : new live.StripePayments(),
      mailer: new live.ResendMailer(),
      storage: new live.SupabaseVideoStorage(),
      sms: new live.TwilioSms(),
      now: () => new Date(),
    };
  }
  return g.__tamLive;
}
