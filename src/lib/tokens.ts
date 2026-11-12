import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Magic-link tokens: `<id>.<signature>` where signature = HMAC(APP_SECRET, purpose:id:nonce).
 * - Deterministic, so retried emails always carry a working link.
 * - Revocable: rotating the nonce stored on the row invalidates every outstanding link.
 * - Expiry is enforced by the row's own deadline (e.g. request.expires_at), not the token.
 */
export type TokenPurpose = "coach" | "delivery" | "payouts" | "unsub" | "admin";

function sign(purpose: TokenPurpose, id: string, nonce: string, secret = env.appSecret()): string {
  return createHmac("sha256", secret).update(`${purpose}:${id}:${nonce}`).digest("base64url").slice(0, 32);
}

export function makeToken(purpose: TokenPurpose, id: string, nonce = ""): string {
  return `${id}.${sign(purpose, id, nonce)}`;
}

/** Returns the id embedded in a token WITHOUT verifying it. Always call verifyToken afterwards. */
export function tokenId(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  return /^[A-Za-z0-9_-]{1,200}$/.test(id) ? id : null;
}

export function verifyToken(purpose: TokenPurpose, token: string, nonce = ""): boolean {
  const id = tokenId(token);
  if (!id) return false;
  const given = Buffer.from(token.slice(id.length + 1));
  const expected = Buffer.from(sign(purpose, id, nonce));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function emailTokenId(email: string): string {
  return Buffer.from(email.trim().toLowerCase()).toString("base64url");
}
export function emailFromTokenId(id: string): string | null {
  try {
    const e = Buffer.from(id, "base64url").toString("utf8");
    return e.includes("@") ? e : null;
  } catch {
    return null;
  }
}

/** Admin session cookie: `<expiresAtMs>.<sig>` */
export function makeAdminSession(ttlMs = 12 * 60 * 60 * 1000): string {
  const exp = String(Date.now() + ttlMs);
  return `${exp}.${sign("admin", "session", exp)}`;
}
export function verifyAdminSession(value: string | undefined): boolean {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = Buffer.from(sign("admin", "session", exp));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function randomRef(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "TAM-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
