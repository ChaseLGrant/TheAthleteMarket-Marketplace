import { z } from "zod";
import { handleApiError, json } from "@/lib/api";
import { resolveCoachLink } from "@/lib/services/access";
import { declineRequest } from "@/lib/services/lifecycle";
import { getDeps } from "@/lib/deps";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const deps = await getDeps();
    const found = await resolveCoachLink(deps, (await ctx.params).token);
    if (!found) return json({ error: "Invalid link" }, 404);
    const body = z.object({ reason: z.string().max(300).optional() }).safeParse(await req.json().catch(() => ({})));
    const r = await declineRequest(deps, found.req, body.success ? body.data.reason ?? null : null);
    return json({ status: r.status });
  } catch (e) {
    return handleApiError(e);
  }
}
