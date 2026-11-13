import { cx } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/state-machine";
import type { RequestStatus } from "@/lib/types";

const TONE: Record<string, string> = {
  green: "bg-success-50 text-success", blue: "bg-blue-50 text-blue", amber: "bg-warn-50 text-warn", red: "bg-danger-50 text-danger", gray: "bg-surface text-muted ring-1 ring-line",
};
const REQ: Record<RequestStatus, keyof typeof TONE> = {
  awaiting_payment: "gray", paid: "blue", coach_notified: "blue", accepted: "blue", submitted: "amber",
  completed: "green", declined: "red", expired: "red", refunded: "gray", cancelled: "gray",
};
const OTHER: Record<string, keyof typeof TONE> = {
  paid: "green", processing: "blue", pending: "amber", blocked: "amber", failed: "red", reversed: "red", none: "gray",
  succeeded: "green", approved: "green", verified: "green", denied: "red", rejected: "red", suspended: "red",
  pending_review: "amber", not_reviewed: "gray", unverified: "gray", participating: "blue", directory: "gray",
};

export function Pill({ value, kind = "other" }: { value: string; kind?: "request" | "other" }) {
  const tone = kind === "request" ? REQ[value as RequestStatus] ?? "gray" : OTHER[value] ?? "gray";
  return <span className={cx("pill whitespace-nowrap", TONE[tone])}>{kind === "request" ? STATUS_LABEL[value as RequestStatus] ?? value : value.replace(/_/g, " ")}</span>;
}
