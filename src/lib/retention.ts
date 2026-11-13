import type { EvalRequest, Settings } from "./types";

/** When a delivered video will be auto-deleted. */
export function videoAvailableUntil(req: Pick<EvalRequest, "completed_at">, s: Pick<Settings, "video_retention_days">): Date | null {
  return req.completed_at ? new Date(Date.parse(req.completed_at) + s.video_retention_days * 86_400_000) : null;
}

/** Never delete a video that is evidence in an open chargeback. */
export function videoDeletable(req: Pick<EvalRequest, "stripe_dispute_id" | "dispute_status">): boolean {
  return !req.stripe_dispute_id || ["won", "lost", "warning_closed"].includes(req.dispute_status ?? "");
}
