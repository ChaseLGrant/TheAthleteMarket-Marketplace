export type EvalFormat = "written" | "voice" | "video" | "ask";
export const FORMAT_LABEL: Record<EvalFormat, string> = { written: "Written take", voice: "Voice note", video: "Video breakdown", ask: "Coach Line message" };

export type AnswerKind = "camp" | "event" | "film" | "update" | "level" | "personal";
export interface CampItem { name: string; dates: string; location?: string; url?: string }
export interface EventItem { name: string; dates: string; location?: string }
export interface ThreadMessage { id: number; request_id: string; direction: "parent_to_coach" | "coach_to_parent"; channel: "email" | "sms" | "web"; body: string; created_at: string }
export interface AskDraft {
  id: string; from_email: string; target_school: string | null; target_sport: string | null; coach_id: string | null;
  subject: string | null; message: string; film_url: string | null; status: "pending" | "sent" | "expired";
  request_id: string | null; created_at: string;
}
export interface SavedPayer {
  email: string; stripe_customer_id: string; stripe_payment_method_id: string; name: string | null; phone: string | null;
  athlete_name: string | null; athlete_grad_year: number | null; athlete_position: string | null; athlete_sport: string | null; updated_at: string;
}
export interface Order {
  id: string; ref: string; stripe_checkout_session_id: string | null; stripe_customer_id: string | null;
  stripe_payment_method_id: string | null; purchaser_email: string; total_cents: number; school_count: number;
  status: "awaiting_payment" | "authorized" | "cancelled"; created_at: string;
}

export type ListingType = "directory" | "participating";
export type CoachKind = "active_college" | "former_college" | "independent" | "pro_player";
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";
export type EligibilityStatus = "not_reviewed" | "pending_review" | "approved" | "denied" | "suspended";

export type RequestStatus =
  | "awaiting_payment"
  | "paid"
  | "coach_notified"
  | "accepted"
  | "submitted"
  | "completed"
  | "declined"
  | "expired"
  | "refunded"
  | "cancelled";

export type PayoutStatus = "none" | "pending" | "blocked" | "processing" | "paid" | "failed" | "reversed";
export type RefundStatus = "none" | "processing" | "succeeded" | "failed";

export interface Settings {
  price_tiers_cents: number[];
  commission_bps: number;
  deadline_days: number;
  max_open_requests_per_coach: number;
  require_admin_review: boolean;
  allow_active_college_coaches: boolean;
  retention_days: number;
  video_retention_days: number;
  format_prices: Record<"written" | "voice" | "video", number>;
  /** Coach Line: price for asking 1 / 3 / 5 schools. */
  ask_prices: Record<string, number>;
  ask_coach_share_bps: number;
  escalate_after_hours: number;
  show_directory_listings: boolean;
  require_payouts_before_booking: boolean;
}

export interface Coach {
  id: string;
  slug: string;
  full_name: string;
  title: string | null;
  school: string | null;
  sport: string;
  division: string | null;
  conference: string | null;
  state: string | null;
  email: string | null;
  photo_url: string | null;
  bio: string | null;
  credentials: string | null;
  listing_type: ListingType;
  coach_kind: CoachKind;
  verification_status: VerificationStatus;
  eligibility_status: EligibilityStatus;
  eligibility_basis: string | null;
  authorization_reference: string | null;
  eligibility_reviewed_at: string | null;
  eligibility_expires_at: string | null;
  price_cents: number | null;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean;
  stripe_transfers_active: boolean;
  stripe_details_submitted: boolean;
  opted_out: boolean;
  is_demo: boolean;
  application_message: string | null;
  phone: string | null;
  sms_opt_in_at: string | null;
  sms_opted_out: boolean;
  paused: boolean;
  intro_video_path: string | null;
  delivered_count: number;
  delivery_hours_total: number;
  rating_sum: number;
  rating_count: number;
  payout_invite_sent_at: string | null;
  last_summary_at: string | null;
  self_attested_at?: string | null;
  email_confirmed_at: string | null;
  source: "import" | "self" | "family" | "admin";
  unlisted: boolean;
  removed: boolean;
  stripe_legal_name: string | null;
  name_match_override: boolean;
  requests_received: number;
  email_status?: "ok" | "bounced" | "complained";
  camps: CampItem[];
  events: EventItem[];
  answers_count: number;
  answer_hours_total: number;
  line_slug: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvalRequest {
  id: string;
  ref: string;
  coach_id: string;
  status: RequestStatus;
  payout_status: PayoutStatus;
  refund_status: RefundStatus;
  athlete_name: string;
  sport: string;
  position: string;
  grad_year: number;
  film_url: string;
  athlete_email: string | null;
  metrics: string | null;
  gpa: string | null;
  message: string | null;
  athlete_is_minor: boolean;
  purchaser_name: string;
  purchaser_email: string;
  purchaser_relationship: "parent_guardian" | "athlete_adult";
  guardian_consent_at: string | null;
  terms_accepted_at: string;
  currency: string;
  price_cents: number;
  platform_fee_cents: number;
  coach_payout_cents: number;
  stripe_fee_cents: number | null;
  payment_captured_at: string | null;
  authorization_expires_at: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_refund_id: string | null;
  stripe_transfer_id: string | null;
  stripe_dispute_id: string | null;
  dispute_status: string | null;
  payout_block_reason: string | null;
  last_error: string | null;
  coach_link_nonce: string;
  delivery_link_nonce: string;
  paid_at: string | null;
  expires_at: string | null;
  coach_notified_at: string | null;
  coach_viewed_at: string | null;
  accepted_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  delivered_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  expired_at: string | null;
  refunded_at: string | null;
  paid_out_at: string | null;
  coach_attested_at: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  onboarding_email_sent_at: string | null;
  refund_attempts: number;
  payout_attempts: number;
  purged_at: string | null;
  video_deleted_at: string | null;
  takeaway_strength: string | null;
  takeaway_improve: string | null;
  takeaway_next: string | null;
  rating: number | null;
  would_buy_again: boolean | null;
  rating_comment: string | null;
  rated_at: string | null;
  film_issue_at: string | null;
  film_issue_note: string | null;
  parent_request_id: string | null;
  format: EvalFormat;
  level_read: string | null;
  response_text: string | null;
  response_kind: "written" | "voice" | "video" | "link" | null;
  response_link: string | null;
  response_from: string | null;
  purchaser_phone: string | null;
  purchaser_sms_opt_in_at: string | null;
  target_school: string | null;
  target_sport: string | null;
  escalation_ids: string[];
  escalation_index: number;
  escalated_at: string | null;
  answer_kind: AnswerKind | null;
  answer_payload: Record<string, unknown> | null;
  order_id: string | null;
  parent_notified_open_at: string | null;
  video_path: string | null;
  video_mime: string | null;
  video_size_bytes: number | null;
  video_duration_seconds: number | null;
  video_view_count: number;
  utm_source: string | null;
  utm_campaign: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestEvent {
  id: number;
  request_id: string;
  type: string;
  from_status: string | null;
  to_status: string | null;
  actor: string;
  data: Record<string, unknown> | null;
  created_at: string;
}

export interface EmailLogRow {
  id: number;
  channel?: "email" | "sms";
  dedupe_key?: string | null;
  request_id: string | null;
  coach_id: string | null;
  to_email: string;
  template: string;
  subject: string;
  provider_id: string | null;
  status: "sent" | "failed" | "suppressed";
  error: string | null;
  created_at: string;
}

export interface DisputeRow {
  id: string;
  request_id: string | null;
  amount_cents: number;
  reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CoachSearch {
  q?: string;
  sport?: string;
  division?: string;
  conference?: string;
  state?: string;
  availableOnly?: boolean;
  limit?: number;
  offset?: number;
}
