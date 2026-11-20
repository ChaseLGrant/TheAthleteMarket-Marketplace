import { z } from "zod";
import { getDeps } from "@/lib/deps";
import { json } from "@/lib/api";
import { slugify } from "@/lib/format";
import { clientIp } from "@/lib/server";
import { coachLineAddress } from "@/lib/services/line";

/**
 * Coach Line: a parent adds ANY college coach by email, right from the ask box.
 * No directory needed. The coach is kept private (unlisted): never shown or suggested to other families.
 */
const schema = z.object({
  coachEmail: z.string().trim().toLowerCase().max(254).email("Enter the coach's email"),
  coachName: z.string().trim().min(2, "Enter the coach's name").max(80),
  school: z.string().trim().max(120).optional().transform((v) => v || null),
  sport: z.string().trim().max(60).optional().transform((v) => v || "Other"),
  title: z.string().trim().max(80).optional().transform((v) => v || null),
});

export async function POST(req: Request) {
  const b = schema.safeParse(await req.json().catch(() => null));
  if (!b.success) return json({ error: b.error.issues[0]?.message ?? "Check the coach's details." }, 400);
  const deps = await getDeps();
  if (!(await deps.store.rateLimit(`addcoach:${await clientIp()}`, 3600, 15))) return json({ error: "Too many coaches added. Try again in an hour." }, 429);
  const a = b.data;
  if (await deps.store.isSuppressed(a.coachEmail)) return json({ error: "This coach has asked not to receive messages." }, 409);
  let coach = (await deps.store.findCoachesByEmail(a.coachEmail)).find((c) => !c.removed) ?? null;
  if (coach?.opted_out) return json({ error: "This coach has asked not to receive messages." }, 409);
  if (!coach) {
    const base = slugify(`${a.coachName} ${a.school ?? ""}`) || "coach";
    let slug = base;
    for (let i = 2; await deps.store.getCoachBySlug(slug); i++) slug = `${base}-${i}`;
    coach = await deps.store.insertCoach({
      slug, full_name: a.coachName, email: a.coachEmail, school: a.school, sport: a.sport, title: a.title,
      listing_type: "directory", source: "family", unlisted: true, coach_kind: "active_college",
    });
  }
  return json({
    target: { coachSlug: coach.slug, school: coach.school ?? a.school ?? undefined, sport: coach.sport === "Other" ? undefined : coach.sport, label: coach.full_name, sub: [coach.title, coach.school].filter(Boolean).join(" · ") || coach.email!, address: coachLineAddress(coach) },
  });
}
