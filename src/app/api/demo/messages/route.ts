import { NextResponse } from "next/server";
import { getDemo } from "@/lib/deps";
import { isDemoMode } from "@/lib/env";

/** DEMO ONLY: every email and text the app has "sent", newest first. */
export async function GET() {
  if (!isDemoMode()) return new NextResponse("Not found", { status: 404 });
  const d = await getDemo();
  return NextResponse.json({ emails: d.mailer.sent, sms: d.sms.sent });
}
