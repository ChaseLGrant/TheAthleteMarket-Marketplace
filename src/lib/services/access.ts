import type { Deps } from "../deps";
import { tokenId, verifyToken, emailFromTokenId } from "../tokens";
import type { Coach, EvalRequest } from "../types";

export async function resolveCoachLink(deps: Deps, token: string): Promise<{ req: EvalRequest; coach: Coach } | null> {
  const id = tokenId(token);
  if (!id) return null;
  const req = await deps.store.getRequest(id);
  if (!req || !verifyToken("coach", token, req.coach_link_nonce)) return null;
  const coach = await deps.store.getCoach(req.coach_id);
  return coach ? { req, coach } : null;
}

export async function resolveDeliveryLink(deps: Deps, token: string): Promise<{ req: EvalRequest; coach: Coach } | null> {
  const id = tokenId(token);
  if (!id) return null;
  const req = await deps.store.getRequest(id);
  if (!req || !verifyToken("delivery", token, req.delivery_link_nonce)) return null;
  if (req.status !== "completed" || !req.video_path || req.purged_at) return null;
  const coach = await deps.store.getCoach(req.coach_id);
  return coach ? { req, coach } : null;
}

export async function resolvePayoutsLink(deps: Deps, token: string): Promise<Coach | null> {
  const id = tokenId(token);
  if (!id || !verifyToken("payouts", token)) return null;
  return deps.store.getCoach(id);
}

export function resolveUnsubscribe(token: string): string | null {
  const id = tokenId(token);
  if (!id || !verifyToken("unsub", token)) return null;
  return emailFromTokenId(id);
}
