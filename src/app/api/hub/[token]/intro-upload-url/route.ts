import { handleApiError, json } from "@/lib/api";
import { getDeps } from "@/lib/deps";
import { resolvePayoutsLink } from "@/lib/services/access";
import { createIntroUploadTarget } from "@/lib/services/experience";
import { uploadRequestSchema } from "@/lib/validation";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const deps = await getDeps();
    const coach = await resolvePayoutsLink(deps, (await ctx.params).token);
    if (!coach) return json({ error: "Invalid link" }, 404);
    const body = uploadRequestSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return json({ error: "Invalid upload request" }, 400);
    return json(await createIntroUploadTarget(deps, coach, body.data));
  } catch (e) {
    return handleApiError(e);
  }
}
