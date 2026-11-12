import type { RequestStatus } from "./types";

/** Every allowed lifecycle transition. Anything else is a bug and is rejected. */
export const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  awaiting_payment: ["paid", "cancelled"],
  paid: ["coach_notified", "expired", "refunded"],
  coach_notified: ["accepted", "submitted", "declined", "expired", "refunded"],
  accepted: ["submitted", "declined", "expired", "refunded"],
  submitted: ["completed", "refunded"],
  completed: ["refunded"],
  declined: ["refunded"],
  expired: ["refunded"],
  refunded: [],
  cancelled: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses from which `to` is reachable in one step. Used to build compare-and-set updates. */
export function sourcesFor(to: RequestStatus): RequestStatus[] {
  return (Object.keys(TRANSITIONS) as RequestStatus[]).filter((s) => TRANSITIONS[s].includes(to));
}

export const STATUS_LABEL: Record<RequestStatus, string> = {
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  coach_notified: "Coach notified",
  accepted: "Coach recording",
  submitted: "Video submitted",
  completed: "Delivered",
  declined: "Declined",
  expired: "Expired",
  refunded: "Refunded",
  cancelled: "Checkout abandoned",
};

/** Coach can still respond (record or decline). */
export const COACH_ACTIONABLE: RequestStatus[] = ["paid", "coach_notified", "accepted"];
