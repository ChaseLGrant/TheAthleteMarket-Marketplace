import { getDeps } from "@/lib/deps";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { handleParentSms } from "@/lib/services/line";
import { safeEqual } from "@/lib/tokens";
import { twilioSignature } from "@/lib/twilio-signature";

/**
 * Twilio inbound SMS: a parent texts back → relayed to the coach who answered.
 * Twilio → Messaging Service → Integration → "Send a webhook":
 *   https://marketplace.theathletemarket.com/api/inbound/twilio
 */
const twiml = (status = 200) => new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", { status, headers: { "Content-Type": "text/xml" } });

export async function POST(req: Request) {
  const token = env.twilio()?.token;
  const params = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;
  if (!token) return twiml(503);
  const url = `${env.siteUrl()}/api/inbound/twilio`;
  if (!safeEqual(req.headers.get("x-twilio-signature") ?? "", twilioSignature(token, url, params))) {
    log("warn", "twilio inbound: bad signature");
    return twiml(403);
  }
  try {
    const deps = await getDeps();
    const id = params.MessageSid ?? params.SmsSid;
    if (id && !(await deps.store.claimInbound(`sms:${id}`, null, params.From ?? ""))) return twiml();
    const outcome = await handleParentSms(deps, params.From ?? "", params.Body ?? "");
    if (id) await deps.store.setInboundOutcome(`sms:${id}`, outcome).catch(() => {});
  } catch (e) {
    log("error", "twilio inbound failed", { error: String(e) });
    return twiml(500); // Twilio retries
  }
  return twiml();
}
