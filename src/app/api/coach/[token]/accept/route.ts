import { handleApiError, json } from "@/lib/api";
import { resolveCoachLink } from "@/lib/services/access";
import { acceptRequest } from "@/lib/services/lifecycle";
import { getDeps } from "@/lib/deps";

export async function POST(_: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const deps = await getDeps();
    const found = await resolveCoachLink(deps, (await ctx.params).token);
    if (!found) return json({ error: "Invalid link" }, 404);
    const r = await acceptRequest(deps, found.req);
    return json({ status: r.status });
  } catch (e) {
    return handleApiError(e);
  }
}
