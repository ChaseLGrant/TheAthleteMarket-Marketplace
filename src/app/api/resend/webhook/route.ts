import { json } from "@/lib/api";
import { getDeps } from "@/lib/deps";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { handleUndeliverable, verifySvix } from "@/lib/services/deliverability";

/** Resend → Webhooks: subscribe this URL to email.bounced and email.complained. */
export async function POST(req: Request) {
  const secret = env.resendWebhookSecret();
  if (!secret) return json({ error: "not configured" }, 503);
  const body = await req.text();
  const ok = verifySvix(secret, {
    id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature"),
  }, body);
  if (!ok) return json({ error: "invalid signature" }, 400);
  const evt = JSON.parse(body) as { type?: string; data?: { to?: string[] | string; bounce?: { type?: string } } };
  const to = ([] as string[]).concat(evt.data?.to ?? []);
  const deps = await getDeps();
  if (evt.type === "email.complained") for (const e of to) await handleUndeliverable(deps, e, "complained");
  // Only permanent bounces; temporary ones (mailbox full etc.) are retried by the provider.
  if (evt.type === "email.bounced" && (evt.data?.bounce?.type ?? "Permanent").toLowerCase().startsWith("perm"))
    for (const e of to) await handleUndeliverable(deps, e, "bounced");
  log("info", "resend webhook", { type: evt.type, count: to.length });
  return json({ ok: true });
}
