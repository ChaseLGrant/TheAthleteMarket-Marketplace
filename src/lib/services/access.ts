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
  // A deleted video still resolves, so the page can explain it was removed after the retention window.
  if (req.status !== "completed" || req.purged_at) return null;
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

/** Family's "fix my film link" page. */
export async function resolveFixLink(deps: Deps, token: string): Promise<{ req: EvalRequest; coach: Coach } | null> {
  const id = tokenId(token);
  if (!id) return null;
  const req = await deps.store.getRequest(id);
  if (!req || !verifyToken("fix", token, req.delivery_link_nonce)) return null;
  const coach = await deps.store.getCoach(req.coach_id);
  return coach ? { req, coach } : null;
}

/** "Second opinion" prefill: returns the original request (completed only). */
export async function resolveAgainLink(deps: Deps, token: string): Promise<EvalRequest | null> {
  const id = tokenId(token);
  if (!id) return null;
  const req = await deps.store.getRequest(id);
  if (!req || !verifyToken("again", token, req.delivery_link_nonce) || req.status !== "completed" || req.purged_at) return null;
  return req;
}
