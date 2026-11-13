import { handleApiError, json } from "@/lib/api";
import { getDeps } from "@/lib/deps";
import { resolvePayoutsLink } from "@/lib/services/access";
import { saveIntroVideo } from "@/lib/services/experience";
import { introSubmitSchema } from "@/lib/validation";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const deps = await getDeps();
    const coach = await resolvePayoutsLink(deps, (await ctx.params).token);
    if (!coach) return json({ error: "Invalid link" }, 404);
    const body = introSubmitSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return json({ error: body.error.issues[0]?.message ?? "Invalid submission" }, 400);
    await saveIntroVideo(deps, coach, { path: body.data.path, durationSeconds: body.data.durationSeconds ?? null });
    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
