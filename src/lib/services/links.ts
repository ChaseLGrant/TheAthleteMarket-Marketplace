import { env } from "../env";
import { emailTokenId, makeToken } from "../tokens";
import type { Coach, EvalRequest } from "../types";

const site = () => env.siteUrl();
export const coachReviewUrl = (r: EvalRequest) => `${site()}/r/${makeToken("coach", r.id, r.coach_link_nonce)}`;
export const coachDeclineUrl = (r: EvalRequest) => `${coachReviewUrl(r)}/decline`;
export const deliveryUrl = (r: EvalRequest) => `${site()}/v/${makeToken("delivery", r.id, r.delivery_link_nonce)}`;
/** The coach's private hub: payouts, pause, intro video, open requests. */
export const payoutsUrl = (c: Coach) => `${site()}/coach/payouts/${makeToken("payouts", c.id)}`;
export const hubUrl = payoutsUrl;
/** Family page to replace a film link the coach couldn't open. */
export const fixFilmUrl = (r: EvalRequest) => `${site()}/fix/${makeToken("fix", r.id, r.delivery_link_nonce)}`;
/** Pre-filled "get a second opinion" search for the same athlete. */
export const secondOpinionUrl = (r: EvalRequest) =>
  `${site()}/coaches?available=1&sport=${encodeURIComponent(r.sport)}&from=${makeToken("again", r.id, r.delivery_link_nonce)}`;
export const unsubscribeUrl = (email: string) => `${site()}/unsubscribe/${makeToken("unsub", emailTokenId(email))}`;
export const adminRequestUrl = (id: string) => `${site()}/admin/requests/${id}`;
