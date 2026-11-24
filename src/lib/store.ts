import type {
  AskDraft, Coach, CoachSearch, DisputeRow, EmailLogRow, EvalRequest, Order, SavedPayer, PayoutStatus, RefundStatus, ThreadMessage,
  RequestEvent, RequestStatus, Settings,
} from "./types";

export interface RequestWhere {
  status?: RequestStatus[];
  payout_status?: PayoutStatus[];
  refund_status?: RefundStatus[];
  /** require expires_at > this ISO timestamp (prevents late submissions) */
  expiresAfter?: string;
  /** require expires_at <= this ISO timestamp (only expire what is truly overdue) */
  expiresBefore?: string;
  /** require these columns to be NULL (e.g. "not rated yet") */
  isNull?: (keyof EvalRequest)[];
}

export interface RequestFilter {
  status?: RequestStatus[];
  payout_status?: PayoutStatus[];
  refund_status?: RefundStatus[];
  coach_id?: string;
  order_id?: string;
  expiresBefore?: string;
  purchaser_email?: string;
  completedBefore?: string;
  q?: string;
  limit?: number;
}

export type NewRequest = Omit<
  EvalRequest,
  | "id" | "status" | "payout_status" | "refund_status" | "coach_link_nonce" | "delivery_link_nonce"
  | "created_at" | "updated_at" | "reminder_count" | "refund_attempts" | "payout_attempts" | "video_view_count"
  | "stripe_fee_cents" | "payment_captured_at" | "authorization_expires_at" | "stripe_checkout_session_id" | "stripe_payment_intent_id" | "stripe_charge_id"
  | "stripe_refund_id" | "stripe_transfer_id" | "stripe_dispute_id" | "dispute_status" | "payout_block_reason"
  | "last_error" | "paid_at" | "expires_at" | "coach_notified_at" | "coach_viewed_at" | "accepted_at"
  | "submitted_at" | "completed_at" | "delivered_at" | "declined_at" | "decline_reason" | "expired_at"
  | "refunded_at" | "paid_out_at" | "coach_attested_at" | "last_reminder_at" | "onboarding_email_sent_at"
  | "purged_at" | "video_deleted_at" | "takeaway_strength" | "takeaway_improve" | "takeaway_next" | "rating" | "would_buy_again" | "rating_comment" | "rated_at" | "film_issue_at" | "film_issue_note" | "level_read" | "escalated_at" | "answer_kind" | "answer_payload" | "parent_notified_open_at" | "escalation_index" | "response_text" | "response_kind" | "response_link" | "response_from" | "video_path" | "video_mime" | "video_size_bytes" | "video_duration_seconds"
>;

export interface Store {
  getSettings(): Promise<Settings>;
  /** Migrations whose columns are missing from the live database (empty when up to date). Optional: memory store has none. */
  pendingMigrations?(): Promise<string[]>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  getCoach(id: string): Promise<Coach | null>;
  getCoachBySlug(slug: string): Promise<Coach | null>;
  getCoachByStripeAccount(accountId: string): Promise<Coach | null>;
  findCoachesByEmail(email: string): Promise<Coach[]>;
  /** Public search. `participatingFirst` ordering is applied by implementations. */
  searchCoaches(s: CoachSearch & { includeDirectory?: boolean }): Promise<{ coaches: Coach[]; total: number }>;
  listParticipatingCoaches(): Promise<Coach[]>;
  listCoachesAdmin(f: { q?: string; listing?: string; eligibility?: string; limit?: number }): Promise<Coach[]>;
  coachFacets(): Promise<{ sports: string[]; conferences: string[] }>;
  insertCoach(c: Partial<Coach> & Pick<Coach, "slug" | "full_name" | "sport">): Promise<Coach>;
  updateCoach(id: string, patch: Partial<Coach>): Promise<Coach>;

  insertRequest(r: NewRequest): Promise<EvalRequest>;
  getRequest(id: string): Promise<EvalRequest | null>;
  getRequestBy(
    field: "stripe_checkout_session_id" | "stripe_payment_intent_id" | "stripe_charge_id" | "ref",
    value: string,
  ): Promise<EvalRequest | null>;
  /** Atomic compare-and-set. Returns the updated row, or null if `where` no longer matched. */
  casRequest(id: string, where: RequestWhere, patch: Partial<EvalRequest>): Promise<EvalRequest | null>;
  listRequests(f: RequestFilter): Promise<EvalRequest[]>;
  countOpenRequestsForCoach(coachId: string): Promise<number>;

  addEvent(e: Omit<RequestEvent, "id" | "created_at">): Promise<void>;
  listEvents(requestId: string): Promise<RequestEvent[]>;

  /** Webhook idempotency: 'new' first time, 'retry' if seen but never finished, 'done' if already processed. */
  claimStripeEvent(id: string, type: string): Promise<"new" | "retry" | "done">;
  finishStripeEvent(id: string, error?: string): Promise<void>;

  logEmail(row: Omit<EmailLogRow, "id" | "created_at">): Promise<void>;
  /** Insert a message log row with a unique dedupe key. Returns false if that key was already claimed (never send twice). */
  claimMessage(row: Omit<EmailLogRow, "id" | "created_at"> & { dedupe_key: string }): Promise<boolean>;
  finishMessage(dedupeKey: string, patch: { status: EmailLogRow["status"]; provider_id?: string | null; error?: string | null }): Promise<void>;
  listEmails(f: { request_id?: string; limit?: number }): Promise<EmailLogRow[]>;
  isSuppressed(email: string): Promise<boolean>;
  suppress(email: string, reason: string): Promise<void>;

  upsertDispute(d: Omit<DisputeRow, "created_at" | "updated_at">): Promise<void>;
  listDisputes(): Promise<DisputeRow[]>;

  addWaitlist(coachId: string, email: string): Promise<void>;
  waitlistCounts(): Promise<Record<string, number>>;

  track(name: string, coachId?: string | null, requestId?: string | null): Promise<void>;
  countAnalytics(name: string, sinceIso?: string): Promise<number>;

  listMarketingSpend(): Promise<{ id: number; month: string; channel: string; amount_cents: number }[]>;
  addMarketingSpend(r: { month: string; channel: string; amount_cents: number }): Promise<void>;

  /** true = allowed, false = limited */
  rateLimit(key: string, windowSeconds: number, max: number): Promise<boolean>;

  /** Inbound email idempotency: true the first time a provider message id is seen. */
  claimInbound(id: string, requestId: string | null, fromEmail: string | null): Promise<boolean>;

  // Coach Line
  insertOrder(o: Omit<Order, "id" | "created_at" | "status" | "stripe_customer_id" | "stripe_payment_method_id">): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  getOrderBySession(sessionId: string): Promise<Order | null>;
  getOrderByRef(ref: string): Promise<Order | null>;
  updateOrder(id: string, patch: Partial<Order>): Promise<Order>;
  addThreadMessage(m: Omit<ThreadMessage, "id" | "created_at">): Promise<void>;
  listThread(requestId: string): Promise<ThreadMessage[]>;
  /** Staff at a school for a sport (for escalation + "ask the staff"). */
  /** Listed staff only — coaches a family added privately (unlisted) are never suggested to anyone else. */
  listStaff(school: string, sport: string): Promise<Coach[]>;
  /** Distinct schools (with sport) matching a query, for the ask box. */
  suggestSchools(q: string, limit: number): Promise<{ school: string; sport: string; staff: number }[]>;
  insertDraft(d: Omit<AskDraft, "id" | "created_at" | "status" | "request_id">): Promise<AskDraft>;
  getDraft(id: string): Promise<AskDraft | null>;
  updateDraft(id: string, patch: Partial<AskDraft>): Promise<AskDraft | null>;
  getSavedPayer(email: string): Promise<SavedPayer | null>;
  upsertSavedPayer(p: Omit<SavedPayer, "updated_at">): Promise<void>;
  setInboundOutcome(id: string, outcome: string): Promise<void>;
}

export const DEFAULT_SETTINGS: Settings = {
  price_tiers_cents: [5000],
  commission_bps: 2000,
  deadline_days: 5,
  max_open_requests_per_coach: 15,
  require_admin_review: false,
  allow_active_college_coaches: true,
  retention_days: 365,
  video_retention_days: 30,
  format_prices: { written: 2000, voice: 3500, video: 5000 },
  ask_prices: { "1": 2000, "3": 4900, "5": 6900 },
  ask_coach_share_bps: 5000,
  escalate_after_hours: 48,
  fast_bonus_cents: 500,
  fast_bonus_hours: 24,
  show_directory_listings: true,
  require_payouts_before_booking: false,
};

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}
