import { NextResponse } from "next/server";
import { getDemo } from "@/lib/deps";
import { isDemoMode } from "@/lib/env";
import { handleInboundEmail } from "@/lib/services/email-native";

/** DEMO ONLY: simulate a coach's reply arriving by email (what Postmark posts in production). */
export async function POST(req: Request) {
  if (!isDemoMode()) return new NextResponse("Not found", { status: 404 });
  const b = (await req.json()) as { to: string; from: string; text: string; memo?: boolean };
  const outcome = await handleInboundEmail(await getDemo(), {
    messageId: `demo-${Date.now()}-${Math.random()}`,
    from: b.from,
    to: [b.to],
    subject: "Re: request",
    text: b.text,
    attachments: b.memo ? [{ name: "Voice Memo.m4a", contentType: "audio/x-m4a", contentBase64: Buffer.alloc(240_000, 7).toString("base64"), size: 240_000 }] : [],
  });
  return NextResponse.json({ outcome });
}
