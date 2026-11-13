import { z } from "zod";
import { handleApiError, json } from "@/lib/api";
import { getDeps } from "@/lib/deps";
import { resolveCoachLink } from "@/lib/services/access";
import { submitResponse } from "@/lib/services/email-native";

const f = z.string().trim().max(3000).optional().transform((v) => (v ? v : null));
const schema = z.object({ level: f, strength: f, improve: f, next: f, extra: f });

/** Written reply typed on the request page (same result as replying by email). */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const deps = await getDeps();
    const found = await resolveCoachLink(deps, (await ctx.params).token);
    if (!found) return json({ error: "Invalid link" }, 404);
    const b = schema.safeParse(await req.json().catch(() => null));
    if (!b.success) return json({ error: "Invalid reply" }, 400);
    const { level, strength, improve, next, extra } = b.data;
    const filled = [strength, improve, next].filter(Boolean).length;
    const text = [
      level && `Level I see you at: ${level}`, strength && `Top strength: ${strength}`,
      improve && `What to work on: ${improve}`, next && `Next step: ${next}`, extra,
    ].filter(Boolean).join("\n");
    if (filled < 2 && text.split(/\s+/).length < 25) return json({ error: "Please fill in at least two of the fields — a sentence each is perfect." }, 400);
    const r = await submitResponse(deps, found.req, {
      kind: "written", text, level, strength, improve, next, path: null, mime: null, size: null, link: null, from: "web-form",
    });
    if (!r) return json({ error: "This request is no longer open." }, 409);
    return json({ status: r.status });
  } catch (e) {
    return handleApiError(e);
  }
}
