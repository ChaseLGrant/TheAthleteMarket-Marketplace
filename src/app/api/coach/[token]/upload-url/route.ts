import { handleApiError, json } from "@/lib/api";
import { resolveCoachLink } from "@/lib/services/access";
import { createUploadTarget } from "@/lib/services/lifecycle";
import { uploadRequestSchema } from "@/lib/validation";
import { getDeps } from "@/lib/deps";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const deps = await getDeps();
    const found = await resolveCoachLink(deps, (await ctx.params).token);
    if (!found) return json({ error: "Invalid link" }, 404);
    const body = uploadRequestSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return json({ error: "Invalid upload request" }, 400);
    return json(await createUploadTarget(deps, found.req, body.data));
  } catch (e) {
    return handleApiError(e);
  }
}
