import { env } from "../env";
import { emailTokenId, makeToken } from "../tokens";
import type { Coach, EvalRequest } from "../types";

const site = () => env.siteUrl();
export const coachReviewUrl = (r: EvalRequest) => `${site()}/r/${makeToken("coach", r.id, r.coach_link_nonce)}`;
export const coachDeclineUrl = (r: EvalRequest) => `${coachReviewUrl(r)}/decline`;
export const deliveryUrl = (r: EvalRequest) => `${site()}/v/${makeToken("delivery", r.id, r.delivery_link_nonce)}`;
export const payoutsUrl = (c: Coach) => `${site()}/coach/payouts/${makeToken("payouts", c.id)}`;
export const unsubscribeUrl = (email: string) => `${site()}/unsubscribe/${makeToken("unsub", emailTokenId(email))}`;
export const adminRequestUrl = (id: string) => `${site()}/admin/requests/${id}`;
