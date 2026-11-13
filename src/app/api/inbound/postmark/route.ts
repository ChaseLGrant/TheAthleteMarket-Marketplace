import { json } from "@/lib/api";
import { getDeps } from "@/lib/deps";
import { log } from "@/lib/log";
import { handleInboundEmail, type InboundEmail } from "@/lib/services/email-native";
import { safeEqual } from "@/lib/tokens";

export const maxDuration = 60;

/**
 * Postmark inbound webhook: coaches' email replies land here.
 * Postmark → Servers → Inbound → Webhook URL:
 *   https://marketplace.theathletemarket.com/api/inbound/postmark?token=YOUR_INBOUND_WEBHOOK_SECRET
 */
interface PostmarkInbound {
  MessageID?: string;
  From?: string;
  FromFull?: { Email?: string };
  To?: string;
  ToFull?: { Email?: string }[];
  CcFull?: { Email?: string }[];
  OriginalRecipient?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  Attachments?: { Name?: string; Content?: string; ContentType?: string; ContentLength?: number }[];
}

export async function POST(req: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET ?? "";
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!secret || !safeEqual(token, secret)) return json({ error: "unauthorized" }, 401);

  const p = (await req.json().catch(() => null)) as PostmarkInbound | null;
  if (!p) return json({ error: "bad payload" }, 400);
  const to = [
    p.OriginalRecipient, ...(p.ToFull ?? []).map((t) => t.Email), ...(p.CcFull ?? []).map((t) => t.Email), p.To,
  ].filter((x): x is string => !!x);
  const text = p.TextBody?.trim() ? p.TextBody : (p.HtmlBody ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
  const msg: InboundEmail = {
    messageId: p.MessageID ?? `${Date.now()}-${Math.random()}`,
    from: (p.FromFull?.Email ?? p.From ?? "").toLowerCase(),
    to,
    subject: p.Subject ?? "",
    text,
    strippedReply: p.StrippedTextReply ?? null,
    attachments: (p.Attachments ?? [])
      .filter((a) => a.Content)
      .map((a) => ({ name: a.Name ?? "attachment", contentType: a.ContentType ?? "application/octet-stream", contentBase64: a.Content!, size: a.ContentLength ?? 0 })),
  };
  try {
    const outcome = await handleInboundEmail(await getDeps(), msg);
    log("info", "inbound email", { outcome, from: msg.from });
    return json({ ok: true, outcome });
  } catch (e) {
    log("error", "inbound email failed", { error: String(e) });
    return json({ error: "processing failed" }, 500); // Postmark retries
  }
}
