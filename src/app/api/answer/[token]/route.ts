import { z } from "zod";
import { handleApiError, json } from "@/lib/api";
import { getDeps } from "@/lib/deps";
import { markAskOpened, passAsk, resolveAnswerLink, submitAnswer } from "@/lib/services/line";

const s = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const item = z.object({ name: z.string().trim().min(2).max(120), dates: z.string().trim().min(2).max(80), location: s(120), url: s(500) });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pass") }),
  z.object({ action: z.literal("opened") }),
  z.object({
    action: z.literal("answer"),
    kind: z.enum(["camp", "event", "film", "update", "level", "personal"]),
    note: s(3000),
    camp: item.optional(),
    event: item.omit({ url: true }).optional(),
    level: s(40),
    save: z.boolean().optional(),
  }),
]);

/** Coach answers (or passes) from the one-tap page. GET never acts — only this POST does. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const deps = await getDeps();
    const found = await resolveAnswerLink(deps, (await ctx.params).token);
    if (!found) return json({ error: "This link isn't valid." }, 404);
    const b = schema.safeParse(await req.json().catch(() => null));
    if (!b.success) return json({ error: "Please complete the answer." }, 400);
    if (b.data.action === "opened") { await markAskOpened(deps, found.req, found.coach); return json({ ok: true }); }
    if (b.data.action === "pass") return json({ status: await passAsk(deps, found.req, found.coach) });
    const d = b.data;
    const r = await submitAnswer(deps, found.req, found.coach, {
      kind: d.kind, note: d.note ?? null, camp: d.camp ?? null, event: d.event ?? null, level: d.level ?? null, save: d.save, via: "link",
    });
    return json({ status: r.status });
  } catch (e) {
    return handleApiError(e);
  }
}
