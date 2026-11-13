import { createHmac } from "node:crypto";

/** Twilio's request signature: base64(HMAC-SHA1(authToken, fullUrl + sorted key/value pairs)). */
export function twilioSignature(token: string, url: string, params: Record<string, string>) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", token).update(data, "utf8").digest("base64");
}
