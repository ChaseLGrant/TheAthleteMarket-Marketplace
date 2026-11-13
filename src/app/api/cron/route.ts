import { json } from "@/lib/api";
import { getDeps } from "@/lib/deps";
import { env } from "@/lib/env";
import { runCron } from "@/lib/services/cron";
import { safeEqual } from "@/lib/tokens";

export const maxDuration = 60; // works on Vercel Hobby; runs are time-boxed to ~50s and resume next run
export const dynamic = "force-dynamic";

/** Called by Vercel Cron (Authorization: Bearer $CRON_SECRET). Safe to call repeatedly. */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env.cronSecret()}`)) return json({ error: "unauthorized" }, 401);
  return json(await runCron(await getDeps()));
}
export const POST = GET;
