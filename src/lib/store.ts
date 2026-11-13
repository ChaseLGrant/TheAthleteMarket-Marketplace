import type {
  Coach, CoachSearch, DisputeRow, EmailLogRow, EvalRequest, PayoutStatus, RefundStatus,
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
}

export interface RequestFilter {
  status?: RequestStatus[];
  payout_status?: PayoutStatus[];
  refund_status?: RefundStatus[];
  coach_id?: string;
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
  | "purged_at" | "video_path" | "video_mime" | "video_size_bytes" | "video_duration_seconds"
>;

export interface Store {
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  getCoach(id: string): Promise<Coach | null>;
  getCoachBySlug(slug: string): Promise<Coach | null>;
  getCoachByStripeAccount(accountId: string): Promise<Coach | null>;
  findCoachesByEmail(email: string): Promise<Coach[]>;
  /** Public search. `participatingFirst` ordering is applied by implementations. */
  searchCoaches(s: CoachSearch): Promise<{ coaches: Coach[]; total: number }>;
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
}

export const DEFAULT_SETTINGS: Settings = {
  price_tiers_cents: [3000, 4000, 5000],
  commission_bps: 0,
  deadline_days: 5,
  max_open_requests_per_coach: 15,
  require_admin_review: false,
  allow_active_college_coaches: false,
  retention_days: 365,
};

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}
