import { handleApiError, json } from "@/lib/api";
import { resolveCoachLink } from "@/lib/services/access";
import { submitVideo } from "@/lib/services/lifecycle";
import { submitSchema } from "@/lib/validation";
import { getDeps } from "@/lib/deps";

export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const deps = await getDeps();
    const found = await resolveCoachLink(deps, (await ctx.params).token);
    if (!found) return json({ error: "Invalid link" }, 404);
    const body = submitSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return json({ error: body.error.issues[0]?.message ?? "Invalid submission" }, 400);
    const r = await submitVideo(deps, found.req, { path: body.data.path, durationSeconds: body.data.durationSeconds ?? null, attest: true, takeaways: body.data.takeaways });
    return json({ status: r.status, payout_status: r.payout_status });
  } catch (e) {
    return handleApiError(e);
  }
}
