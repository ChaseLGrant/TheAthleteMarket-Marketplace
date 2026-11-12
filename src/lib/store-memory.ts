import { randomBytes, randomUUID } from "node:crypto";
import type { Coach, DisputeRow, EmailLogRow, EvalRequest, RequestEvent, Settings } from "./types";
import { DEFAULT_SETTINGS, type NewRequest, type RequestFilter, type RequestWhere, type Store } from "./store";

const clone = <T>(v: T): T => structuredClone(v);
const nowIso = () => new Date().toISOString();
const searchText = (c: Coach) =>
  [c.full_name, c.school, c.sport, c.division, c.conference, c.state, c.title].filter(Boolean).join(" ").toLowerCase();

/** In-memory Store used by unit tests and DEMO_MODE. Mirrors the Supabase semantics. */
export class MemoryStore implements Store {
  settings: Settings = clone(DEFAULT_SETTINGS);
  coaches = new Map<string, Coach>();
  requests = new Map<string, EvalRequest>();
  events: RequestEvent[] = [];
  stripeEvents = new Map<string, { type: string; processed_at: string | null }>();
  emails: EmailLogRow[] = [];
  suppressions = new Map<string, string>();
  disputes = new Map<string, DisputeRow>();
  waitlist = new Set<string>();
  analytics: { name: string; coach_id: string | null; request_id: string | null; created_at: string }[] = [];
  spend: { id: number; month: string; channel: string; amount_cents: number }[] = [];
  limits = new Map<string, { start: number; count: number }>();
  private seq = 1;

  async getSettings() { return clone(this.settings); }
  async updateSettings(patch: Partial<Settings>) { Object.assign(this.settings, patch); return clone(this.settings); }

  async getCoach(id: string) { return clone(this.coaches.get(id) ?? null); }
  async getCoachBySlug(slug: string) { return clone([...this.coaches.values()].find((c) => c.slug === slug) ?? null); }
  async getCoachByStripeAccount(a: string) {
    return clone([...this.coaches.values()].find((c) => c.stripe_account_id === a) ?? null);
  }
  async findCoachesByEmail(email: string) {
    return clone([...this.coaches.values()].filter((c) => c.email?.toLowerCase() === email.trim().toLowerCase()));
  }
  async searchCoaches(s: Parameters<Store["searchCoaches"]>[0]) {
    let list = [...this.coaches.values()].filter((c) => c.listing_type === "directory" || c.verification_status === "verified");
    if (s.q?.trim()) {
      const terms = s.q.trim().toLowerCase().split(/\s+/);
      list = list.filter((c) => terms.every((t) => searchText(c).includes(t)));
    }
    if (s.sport) list = list.filter((c) => c.sport === s.sport);
    if (s.division) list = list.filter((c) => c.division === s.division);
    if (s.conference) list = list.filter((c) => c.conference === s.conference);
    if (s.state) list = list.filter((c) => c.state === s.state);
    if (s.availableOnly) list = list.filter((c) => c.listing_type === "participating" && c.eligibility_status === "approved");
    list.sort((a, b) =>
      a.listing_type !== b.listing_type ? (a.listing_type === "participating" ? -1 : 1) : a.full_name.localeCompare(b.full_name),
    );
    const offset = s.offset ?? 0;
    return { coaches: clone(list.slice(offset, offset + (s.limit ?? 24))), total: list.length };
  }
  async listCoachesAdmin(f: { q?: string; listing?: string; eligibility?: string }) {
    let list = [...this.coaches.values()];
    if (f.q) list = list.filter((c) => searchText(c).includes(f.q!.toLowerCase()));
    if (f.listing) list = list.filter((c) => c.listing_type === f.listing);
    if (f.eligibility) list = list.filter((c) => c.eligibility_status === f.eligibility);
    return clone(list.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
  }
  async coachFacets() {
    const all = [...this.coaches.values()];
    return {
      sports: [...new Set(all.map((c) => c.sport))].sort(),
      conferences: [...new Set(all.map((c) => c.conference).filter((x): x is string => !!x))].sort(),
    };
  }
  async insertCoach(c: Partial<Coach> & Pick<Coach, "slug" | "full_name" | "sport">) {
    if ([...this.coaches.values()].some((x) => x.slug === c.slug)) throw new Error("duplicate slug");
    const row: Coach = {
      id: randomUUID(), title: null, school: null, division: null, conference: null, state: null, email: null,
      photo_url: null, bio: null, credentials: null, listing_type: "directory", coach_kind: "independent",
      verification_status: "unverified", eligibility_status: "not_reviewed", eligibility_basis: null,
      authorization_reference: null, eligibility_reviewed_at: null, eligibility_expires_at: null, price_cents: null,
      stripe_account_id: null, stripe_payouts_enabled: false, stripe_transfers_active: false,
      stripe_details_submitted: false, opted_out: false, is_demo: false, application_message: null,
      created_at: nowIso(), updated_at: nowIso(), ...c,
    };
    this.coaches.set(row.id, row);
    return clone(row);
  }
  async updateCoach(id: string, patch: Partial<Coach>) {
    const c = this.coaches.get(id);
    if (!c) throw new Error("coach not found");
    Object.assign(c, patch, { updated_at: nowIso() });
    return clone(c);
  }

  async insertRequest(r: NewRequest) {
    if ([...this.requests.values()].some((x) => x.ref === r.ref)) throw new Error("duplicate ref");
    const row: EvalRequest = {
      ...r,
      id: randomUUID(), status: "awaiting_payment", payout_status: "none", refund_status: "none",
      coach_link_nonce: randomBytes(16).toString("hex"), delivery_link_nonce: randomBytes(16).toString("hex"),
      created_at: nowIso(), updated_at: nowIso(), reminder_count: 0, refund_attempts: 0, payout_attempts: 0,
      video_view_count: 0, stripe_fee_cents: null, stripe_checkout_session_id: null, stripe_payment_intent_id: null,
      stripe_charge_id: null, stripe_refund_id: null, stripe_transfer_id: null, stripe_dispute_id: null,
      dispute_status: null, payout_block_reason: null, last_error: null, paid_at: null, expires_at: null,
      coach_notified_at: null, coach_viewed_at: null, accepted_at: null, submitted_at: null, completed_at: null,
      delivered_at: null, declined_at: null, decline_reason: null, expired_at: null, refunded_at: null,
      paid_out_at: null, coach_attested_at: null, last_reminder_at: null, onboarding_email_sent_at: null,
      purged_at: null, video_path: null, video_mime: null, video_size_bytes: null, video_duration_seconds: null,
    };
    this.requests.set(row.id, row);
    return clone(row);
  }
  async getRequest(id: string) { return clone(this.requests.get(id) ?? null); }
  async getRequestBy(field: keyof EvalRequest, value: string) {
    return clone([...this.requests.values()].find((r) => r[field] === value) ?? null);
  }
  async casRequest(id: string, where: RequestWhere, patch: Partial<EvalRequest>) {
    // JS is single-threaded and this body has no awaits, so the check-and-write is atomic.
    const r = this.requests.get(id);
    if (!r) return null;
    if (where.status && !where.status.includes(r.status)) return null;
    if (where.payout_status && !where.payout_status.includes(r.payout_status)) return null;
    if (where.refund_status && !where.refund_status.includes(r.refund_status)) return null;
    if (where.expiresAfter && !(r.expires_at && r.expires_at > where.expiresAfter)) return null;
    if (where.expiresBefore && !(r.expires_at && r.expires_at <= where.expiresBefore)) return null;
    Object.assign(r, patch, { updated_at: nowIso() });
    return clone(r);
  }
  async listRequests(f: RequestFilter) {
    let list = [...this.requests.values()];
    if (f.status) list = list.filter((r) => f.status!.includes(r.status));
    if (f.payout_status) list = list.filter((r) => f.payout_status!.includes(r.payout_status));
    if (f.refund_status) list = list.filter((r) => f.refund_status!.includes(r.refund_status));
    if (f.coach_id) list = list.filter((r) => r.coach_id === f.coach_id);
    if (f.expiresBefore) list = list.filter((r) => r.expires_at && r.expires_at < f.expiresBefore!);
    if (f.completedBefore) list = list.filter((r) => r.completed_at && r.completed_at < f.completedBefore!);
    if (f.purchaser_email) list = list.filter((r) => r.purchaser_email.toLowerCase() === f.purchaser_email!.toLowerCase());
    if (f.q) {
      const q = f.q.toLowerCase();
      list = list.filter((r) => [r.ref, r.athlete_name, r.purchaser_email].some((v) => v.toLowerCase().includes(q)));
    }
    return clone(list.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, f.limit ?? 500));
  }
  async countOpenRequestsForCoach(coachId: string) {
    return [...this.requests.values()].filter(
      (r) => r.coach_id === coachId && ["paid", "coach_notified", "accepted", "submitted"].includes(r.status),
    ).length;
  }

  async addEvent(e: Omit<RequestEvent, "id" | "created_at">) {
    this.events.push({ ...clone(e), id: this.seq++, created_at: nowIso() });
  }
  async listEvents(requestId: string) { return clone(this.events.filter((e) => e.request_id === requestId)); }

  async claimStripeEvent(id: string, type: string) {
    const ex = this.stripeEvents.get(id);
    if (!ex) { this.stripeEvents.set(id, { type, processed_at: null }); return "new" as const; }
    return ex.processed_at ? ("done" as const) : ("retry" as const);
  }
  async finishStripeEvent(id: string, error?: string) {
    const ex = this.stripeEvents.get(id);
    if (ex && !error) ex.processed_at = nowIso();
  }

  async logEmail(row: Omit<EmailLogRow, "id" | "created_at">) {
    this.emails.unshift({ ...row, id: this.seq++, created_at: nowIso() });
  }
  async listEmails(f: { request_id?: string; limit?: number }) {
    return clone(this.emails.filter((e) => !f.request_id || e.request_id === f.request_id).slice(0, f.limit ?? 200));
  }
  async isSuppressed(email: string) { return this.suppressions.has(email.toLowerCase()); }
  async suppress(email: string, reason: string) { this.suppressions.set(email.toLowerCase(), reason); }

  async upsertDispute(d: Omit<DisputeRow, "created_at" | "updated_at">) {
    const prev = this.disputes.get(d.id);
    this.disputes.set(d.id, { ...d, created_at: prev?.created_at ?? nowIso(), updated_at: nowIso() });
  }
  async listDisputes() { return clone([...this.disputes.values()]); }

  async addWaitlist(coachId: string, email: string) { this.waitlist.add(`${coachId}|${email.toLowerCase()}`); }
  async waitlistCounts() {
    const out: Record<string, number> = {};
    for (const k of this.waitlist) { const id = k.split("|")[0]!; out[id] = (out[id] ?? 0) + 1; }
    return out;
  }

  async track(name: string, coachId?: string | null, requestId?: string | null) {
    this.analytics.push({ name, coach_id: coachId ?? null, request_id: requestId ?? null, created_at: nowIso() });
  }
  async countAnalytics(name: string, sinceIso?: string) {
    return this.analytics.filter((a) => a.name === name && (!sinceIso || a.created_at >= sinceIso)).length;
  }

  async listMarketingSpend() { return clone(this.spend); }
  async addMarketingSpend(r: { month: string; channel: string; amount_cents: number }) {
    this.spend.unshift({ ...r, id: this.seq++ });
  }

  async rateLimit(key: string, windowSeconds: number, max: number) {
    const now = Date.now();
    const cur = this.limits.get(key);
    if (!cur || now - cur.start > windowSeconds * 1000) { this.limits.set(key, { start: now, count: 1 }); return 1 <= max; }
    cur.count++;
    return cur.count <= max;
  }
}
