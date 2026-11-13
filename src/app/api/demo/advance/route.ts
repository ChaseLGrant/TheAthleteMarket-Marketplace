import { NextResponse } from "next/server";
import { getDemo } from "@/lib/deps";
import { isDemoMode } from "@/lib/env";
import { runCron } from "@/lib/services/cron";

/** DEMO ONLY: move the simulated clock forward and run the background sweep. */
export async function POST(req: Request) {
  if (!isDemoMode()) return new NextResponse("Not found", { status: 404 });
  const { hours } = (await req.json()) as { hours: number };
  const d = await getDemo();
  d.clockOffsetMs += hours * 3_600_000;
  return NextResponse.json(await runCron(d));
}
