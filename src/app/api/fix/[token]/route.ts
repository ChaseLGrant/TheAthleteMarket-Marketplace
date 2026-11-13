import { handleApiError, json } from "@/lib/api";
import { getDeps } from "@/lib/deps";
import { resolveFixLink } from "@/lib/services/access";
import { fixFilmLink } from "@/lib/services/experience";
import { filmFixSchema } from "@/lib/validation";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const deps = await getDeps();
    const found = await resolveFixLink(deps, (await ctx.params).token);
    if (!found) return json({ error: "Invalid link" }, 404);
    const body = filmFixSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return json({ error: body.error.issues[0]?.message ?? "Invalid link" }, 400);
    if (!(await deps.store.rateLimit(`fix:${found.req.id}`, 3600, 10))) return json({ error: "Too many attempts. Try again later." }, 429);
    await fixFilmLink(deps, found.req, body.data.filmUrl);
    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
