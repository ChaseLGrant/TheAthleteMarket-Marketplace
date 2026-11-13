import { json } from "@/lib/api";
import { getDeps } from "@/lib/deps";
import { resolveUnsubscribe } from "@/lib/services/access";
import { unsubscribeEmail } from "@/lib/services/lifecycle";

/** RFC 8058 one-click unsubscribe (mail clients POST here directly). */
export async function POST(_: Request, ctx: { params: Promise<{ token: string }> }) {
  const email = resolveUnsubscribe((await ctx.params).token);
  if (!email) return json({ error: "Invalid link" }, 404);
  await unsubscribeEmail(await getDeps(), email);
  return json({ ok: true });
}
