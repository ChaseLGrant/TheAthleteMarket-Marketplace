import { addCoachSchema } from "@/lib/validation";
import { getDeps } from "@/lib/deps";
import { json } from "@/lib/api";
import { slugify } from "@/lib/format";
import { clientIp } from "@/lib/server";
import { coachLineAddress } from "@/lib/services/line";

/**
 * Coach Line: a parent adds ANY college coach by email, right from the ask box.
 * The coach is saved (unlisted) so the next family asking that school reaches them too.
 */
export async function POST(req: Request) {
  const b = addCoachSchema.safeParse(await req.json().catch(() => null));
  if (!b.success) return json({ error: b.error.issues[0]?.message ?? "Check the coach's details." }, 400);
  const deps = await getDeps();
  if (!(await deps.store.rateLimit(`addcoach:${await clientIp()}`, 3600, 15))) return json({ error: "Too many coaches added. Try again in an hour." }, 429);
  const a = b.data;
  if (await deps.store.isSuppressed(a.coachEmail)) return json({ error: "This coach has asked not to receive messages." }, 409);
  let coach = (await deps.store.findCoachesByEmail(a.coachEmail)).find((c) => !c.removed) ?? null;
  if (coach?.opted_out) return json({ error: "This coach has asked not to receive messages." }, 409);
  if (!coach) {
    const base = slugify(`${a.coachName} ${a.school}`) || "coach";
    let slug = base;
    for (let i = 2; await deps.store.getCoachBySlug(slug); i++) slug = `${base}-${i}`;
    coach = await deps.store.insertCoach({
      slug, full_name: a.coachName, email: a.coachEmail, school: a.school, sport: a.sport, title: a.title ?? null,
      listing_type: "directory", source: "family", unlisted: true, coach_kind: "active_college",
    });
  }
  return json({
    target: { coachSlug: coach.slug, school: coach.school ?? a.school, sport: coach.sport, label: coach.full_name, sub: [coach.title, coach.school].filter(Boolean).join(" · "), address: coachLineAddress(coach) },
  });
}
