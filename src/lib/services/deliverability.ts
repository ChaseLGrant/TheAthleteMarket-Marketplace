import { createHmac, timingSafeEqual } from "node:crypto";
import type { Deps } from "../deps";
import { log } from "../log";
import { declineRequest } from "./lifecycle";

/**
 * Verify a Resend (Svix) webhook signature.
 * signed content = `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256 with the base64 secret after "whsec_".
 */
export function verifySvix(secret: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, body: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${body}`).digest("base64");
  return headers.signature.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const a = Buffer.from(sig), b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

/**
 * A hard bounce or spam complaint: never email that address again (protects sender reputation at volume).
 * If it belongs to a coach, families waiting on that coach are released immediately (not charged) and offered another coach.
 */
export async function handleUndeliverable(deps: Deps, email: string, kind: "bounced" | "complained") {
  await deps.store.suppress(email, kind);
  for (const coach of await deps.store.findCoachesByEmail(email)) {
    await deps.store.updateCoach(coach.id, { email_status: kind, ...(kind === "complained" ? { opted_out: true } : {}) });
    const open = await deps.store.listRequests({ coach_id: coach.id, status: ["paid", "coach_notified", "accepted"] });
    for (const r of open) {
      await declineRequest(deps, r, kind === "bounced" ? "Coach's email address bounced" : "Coach marked our email as spam", "system");
    }
    log("warn", "coach email undeliverable", { coach_id: coach.id, kind, released: open.length });
  }
}
