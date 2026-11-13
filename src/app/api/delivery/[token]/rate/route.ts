import { handleApiError, json } from "@/lib/api";
import { getDeps } from "@/lib/deps";
import { resolveDeliveryLink } from "@/lib/services/access";
import { rateDelivery } from "@/lib/services/experience";
import { ratingSchema } from "@/lib/validation";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const deps = await getDeps();
    const found = await resolveDeliveryLink(deps, (await ctx.params).token);
    if (!found) return json({ error: "Invalid link" }, 404);
    const body = ratingSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return json({ error: "Please choose 1–5 stars" }, 400);
    await rateDelivery(deps, found.req, body.data);
    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
