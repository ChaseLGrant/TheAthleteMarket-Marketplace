import { isDemoMode } from "./env";
import type { Mailer, Payments, VideoStorage } from "./integrations";
import type { Store } from "./store";

export interface Deps {
  store: Store;
  payments: Payments;
  mailer: Mailer;
  storage: VideoStorage;
  now: () => Date;
}

type DemoBundle = Deps & {
  clockOffsetMs: number;
  store: import("./store-memory").MemoryStore;
  payments: import("./integrations-demo").FakePayments;
  mailer: import("./integrations-demo").FakeMailer;
  storage: import("./integrations-demo").FakeVideoStorage;
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
        payments: new demo.FakePayments(),
        mailer: new demo.FakeMailer(),
        storage: new demo.FakeVideoStorage(),
        now: () => new Date(Date.now() + bundle.clockOffsetMs),
      };
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
      payments: new live.StripePayments(),
      mailer: new live.ResendMailer(),
      storage: new live.SupabaseVideoStorage(),
      now: () => new Date(),
    };
  }
  return g.__tamLive;
}
