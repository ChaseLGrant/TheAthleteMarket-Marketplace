import { randomBytes, randomUUID } from "node:crypto";
import type { AskDraft, Coach, DisputeRow, EmailLogRow, EvalRequest, Order, RequestEvent, SavedPayer, Settings, ThreadMessage } from "./types";
import { DEFAULT_SETTINGS, type NewRequest, type RequestFilter, type RequestWhere, type Store } from "./store";

const clone = <T>(v: T): T => structuredClone(v);
/** Public search: everyone except removed, unlisted (family-added) and unconfirmed self-signups. */
const isPublic = (c: Coach) => !c.removed && !c.unlisted && !c.opted_out && (c.source !== "self" || !!c.email_confirmed_at);
const isJoined = (c: Coach) => c.listing_type === "participating" && (c.stripe_transfers_active || !!c.email_confirmed_at);
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
    let list = [...this.coaches.values()].filter((c) => isPublic(c));
    if (s.q?.trim()) {
      const terms = s.q.trim().toLowerCase().split(/\s+/);
      list = list.filter((c) => terms.every((t) => searchText(c).includes(t)));
    }
    if (s.sport) list = list.filter((c) => c.sport === s.sport);
    if (s.division) list = list.filter((c) => c.division === s.division);
    if (s.conference) list = list.filter((c) => c.conference === s.conference);
    if (s.state) list = list.filter((c) => c.state === s.state);
    if (s.availableOnly) list = list.filter((c) => isJoined(c));
    list.sort((a, b) => (isJoined(a) !== isJoined(b) ? (isJoined(a) ? -1 : 1) : a.full_name.localeCompare(b.full_name)));
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
      phone: null, sms_opt_in_at: null, sms_opted_out: false, paused: false, intro_video_path: null, delivered_count: 0,
      delivery_hours_total: 0, rating_sum: 0, rating_count: 0, payout_invite_sent_at: null, last_summary_at: null,
      email_confirmed_at: null, source: "import", unlisted: false, removed: false, stripe_legal_name: null,
      name_match_override: false, requests_received: 0, email_status: "ok", camps: [], events: [], answers_count: 0,
      answer_hours_total: 0, line_slug: null,
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
      video_view_count: 0, stripe_fee_cents: null, payment_captured_at: null, authorization_expires_at: null, stripe_checkout_session_id: null, stripe_payment_intent_id: null,
      stripe_charge_id: null, stripe_refund_id: null, stripe_transfer_id: null, stripe_dispute_id: null,
      dispute_status: null, payout_block_reason: null, last_error: null, paid_at: null, expires_at: null,
      coach_notified_at: null, coach_viewed_at: null, accepted_at: null, submitted_at: null, completed_at: null,
      delivered_at: null, declined_at: null, decline_reason: null, expired_at: null, refunded_at: null,
      paid_out_at: null, coach_attested_at: null, last_reminder_at: null, onboarding_email_sent_at: null,
      purged_at: null, video_deleted_at: null, takeaway_strength: null, takeaway_improve: null, takeaway_next: null,
      rating: null, would_buy_again: null, rating_comment: null, rated_at: null, film_issue_at: null, film_issue_note: null,
      level_read: null, response_text: null, response_kind: null, response_link: null, response_from: null,
      escalated_at: null, answer_kind: null, answer_payload: null, parent_notified_open_at: null, escalation_index: 0,
      video_path: null, video_mime: null, video_size_bytes: null, video_duration_seconds: null,
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
    if (where.isNull?.some((col) => r[col] != null)) return null;
    Object.assign(r, patch, { updated_at: nowIso() });
    return clone(r);
  }
  async listRequests(f: RequestFilter) {
    let list = [...this.requests.values()];
    if (f.status) list = list.filter((r) => f.status!.includes(r.status));
    if (f.payout_status) list = list.filter((r) => f.payout_status!.includes(r.payout_status));
    if (f.refund_status) list = list.filter((r) => f.refund_status!.includes(r.refund_status));
    if (f.coach_id) list = list.filter((r) => r.coach_id === f.coach_id);
    if (f.order_id) list = list.filter((r) => r.order_id === f.order_id);
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
  async claimMessage(row: Omit<EmailLogRow, "id" | "created_at"> & { dedupe_key: string }) {
    if (this.emails.some((e) => e.dedupe_key === row.dedupe_key)) return false;
    this.emails.unshift({ ...row, id: this.seq++, created_at: nowIso() });
    return true;
  }
  async finishMessage(key: string, patch: { status: EmailLogRow["status"]; provider_id?: string | null; error?: string | null }) {
    const e = this.emails.find((x) => x.dedupe_key === key);
    if (e) Object.assign(e, patch);
  }
  async listParticipatingCoaches() {
    return clone([...this.coaches.values()].filter((c) => c.listing_type === "participating"));
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

  orders = new Map<string, Order>();
  thread: ThreadMessage[] = [];
  drafts = new Map<string, AskDraft>();
  payers = new Map<string, SavedPayer>();
  async insertOrder(o: Omit<Order, "id" | "created_at" | "status" | "stripe_customer_id" | "stripe_payment_method_id">) {
    const row: Order = { ...o, id: randomUUID(), status: "awaiting_payment", stripe_customer_id: null, stripe_payment_method_id: null, created_at: nowIso() };
    this.orders.set(row.id, row);
    return clone(row);
  }
  async getOrder(id: string) { return clone(this.orders.get(id) ?? null); }
  async getOrderBySession(sid: string) { return clone([...this.orders.values()].find((o) => o.stripe_checkout_session_id === sid) ?? null); }
  async updateOrder(id: string, patch: Partial<Order>) { const o = this.orders.get(id)!; Object.assign(o, patch); return clone(o); }
  async addThreadMessage(m: Omit<ThreadMessage, "id" | "created_at">) { this.thread.push({ ...m, id: this.seq++, created_at: nowIso() }); }
  async listThread(requestId: string) { return clone(this.thread.filter((t) => t.request_id === requestId)); }
  async listStaff(school: string, sport: string) {
    const s = school.trim().toLowerCase();
    return clone([...this.coaches.values()].filter((c) => (c.school ?? "").trim().toLowerCase() === s && c.sport === sport));
  }
  async suggestSchools(q: string, limit: number) {
    const t = q.trim().toLowerCase();
    const groups = new Map<string, { school: string; sport: string; staff: number }>();
    for (const c of this.coaches.values()) {
      if (!c.school || c.removed || !c.email) continue;
      if (t && !`${c.school} ${c.sport} ${c.full_name}`.toLowerCase().includes(t)) continue;
      const k = `${c.school}|${c.sport}`;
      const g = groups.get(k) ?? { school: c.school, sport: c.sport, staff: 0 };
      g.staff++;
      groups.set(k, g);
    }
    return [...groups.values()].sort((a, b) => b.staff - a.staff || a.school.localeCompare(b.school)).slice(0, limit);
  }
  async insertDraft(d: Omit<AskDraft, "id" | "created_at" | "status" | "request_id">) {
    const row: AskDraft = { ...d, id: randomUUID(), status: "pending", request_id: null, created_at: nowIso() };
    this.drafts.set(row.id, row);
    return clone(row);
  }
  async getDraft(id: string) { return clone(this.drafts.get(id) ?? null); }
  async updateDraft(id: string, patch: Partial<AskDraft>) { const d = this.drafts.get(id); if (!d) return null; Object.assign(d, patch); return clone(d); }
  async getSavedPayer(email: string) { return clone(this.payers.get(email.toLowerCase()) ?? null); }
  async upsertSavedPayer(p: Omit<SavedPayer, "updated_at">) { this.payers.set(p.email.toLowerCase(), { ...p, email: p.email.toLowerCase(), updated_at: nowIso() }); }
  inbound = new Map<string, { request_id: string | null; from_email: string | null; outcome: string }>();
  async claimInbound(id: string, requestId: string | null, fromEmail: string | null) {
    const prev = this.inbound.get(id);
    if (prev && prev.outcome !== "error") return false;
    this.inbound.set(id, { request_id: requestId, from_email: fromEmail, outcome: "processing" });
    return true;
  }
  async setInboundOutcome(id: string, outcome: string) {
    const r = this.inbound.get(id);
    if (r) r.outcome = outcome;
  }
  async rateLimit(key: string, windowSeconds: number, max: number) {
    const now = Date.now();
    const cur = this.limits.get(key);
    if (!cur || now - cur.start > windowSeconds * 1000) { this.limits.set(key, { start: now, count: 1 }); return 1 <= max; }
    cur.count++;
    return cur.count <= max;
  }
}
