import { handleApiError, json } from "@/lib/api";
import { getDeps } from "@/lib/deps";
import { resolveCoachLink } from "@/lib/services/access";
import { reportFilmIssue } from "@/lib/services/experience";
import { filmIssueSchema } from "@/lib/validation";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const deps = await getDeps();
    const found = await resolveCoachLink(deps, (await ctx.params).token);
    if (!found) return json({ error: "Invalid link" }, 404);
    const body = filmIssueSchema.safeParse(await req.json().catch(() => ({})));
    await reportFilmIssue(deps, found.req, body.success ? body.data.note : null);
    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
