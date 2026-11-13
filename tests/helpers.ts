import { MemoryStore } from "@/lib/store-memory";
import { FakeMailer, FakePayments, FakeVideoStorage } from "@/lib/integrations-demo";
import type { Deps } from "@/lib/deps";
import type { Coach } from "@/lib/types";
import type { RequestInput } from "@/lib/validation";
import { createRequestAndCheckout, handleCheckoutPaid } from "@/lib/services/lifecycle";

process.env.APP_SECRET = "test-secret-test-secret-test-secret-123";
process.env.NEXT_PUBLIC_SITE_URL = "https://marketplace.example.test";

export function makeDeps() {
  let now = new Date("2026-11-01T12:00:00Z");
  const deps = {
    store: new MemoryStore(),
    payments: new FakePayments(),
    mailer: new FakeMailer(),
    storage: new FakeVideoStorage(),
    now: () => now,
  };
  const advance = (hours: number) => { now = new Date(now.getTime() + hours * 3_600_000); };
  return { deps: deps as Deps & typeof deps, advance };
}

export async function addCoach(deps: Deps, over: Partial<Coach> = {}) {
  return deps.store.insertCoach({
    slug: over.slug ?? "pat-coach",
    full_name: "Pat Coach",
    sport: "Football",
    email: "pat@example.com",
    listing_type: "participating",
    coach_kind: "former_college",
    verification_status: "verified",
    eligibility_status: "approved",
    eligibility_basis: "Former coach, no current college role",
    price_cents: 4000,
    ...over,
  });
}

export function input(over: Partial<RequestInput> = {}): RequestInput {
  return {
    coachSlug: "pat-coach",
    athleteName: "Sam Athlete",
    sport: "Football",
    position: "WR",
    gradYear: 2028,
    filmUrl: "https://www.hudl.com/video/abc",
    athleteIsMinor: "yes",
    relationship: "parent_guardian",
    purchaserName: "Jamie Parent",
    purchaserEmail: "parent@example.com",
    athleteEmail: null,
    metrics: null,
    gpa: null,
    message: null,
    guardianConsent: "on",
    acceptTerms: "on",
    company: undefined,
    utmSource: null,
    utmCampaign: null,
    ...over,
  };
}

/** Create a request and simulate Stripe's checkout.session.completed. */
export async function paidRequest(deps: Deps & { payments: FakePayments }, over: Partial<RequestInput> = {}) {
  const { requestId } = await createRequestAndCheckout(deps, input(over), { ip: "1.2.3.4" });
  const req = (await deps.store.getRequest(requestId))!;
  deps.payments.authorize(`pi_demo_${req.id}`); // customer completed checkout: card hold placed
  await handleCheckoutPaid(deps, {
    id: req.stripe_checkout_session_id!,
    payment_status: "paid",
    payment_intent: `pi_demo_${req.id}`,
    client_reference_id: req.id,
    amount_total: req.price_cents,
  });
  return (await deps.store.getRequest(requestId))!;
}

export async function upload(deps: Deps & { storage: FakeVideoStorage }, requestId: string, bytes = 2_000_000) {
  const path = `requests/${requestId}/test.mp4`;
  deps.storage.files.set(path, { data: Buffer.alloc(bytes), mime: "video/mp4" });
  return path;
}
