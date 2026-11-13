import type { Target } from "@/components/ask-box";
import type { Deps } from "@/lib/deps";
import type { EvalRequest } from "@/lib/types";

/** Turn ?school=&sport= / ?coach= into ready-made chips. */
export async function targetsFromQuery(deps: Deps, sp: Record<string, string | undefined>): Promise<Target[]> {
  if (sp.coach) {
    const c = await deps.store.getCoachBySlug(sp.coach);
    if (c && !c.removed) return [{ coachSlug: c.slug, school: c.school ?? undefined, sport: c.sport, label: c.full_name, sub: [c.title, c.school].filter(Boolean).join(" · ") }];
  }
  if (sp.school) {
    const sport = sp.sport ?? (await deps.store.suggestSchools(sp.school, 5)).find((g) => g.school.toLowerCase() === sp.school!.toLowerCase())?.sport;
    const staff = sport ? (await deps.store.listStaff(sp.school, sport)).filter((c) => !c.removed && c.email) : [];
    if (staff.length) return [{ school: staff[0]!.school ?? sp.school, sport: staff[0]!.sport, label: staff[0]!.school ?? sp.school, sub: `${staff[0]!.sport} staff · ${staff.length} coach${staff.length === 1 ? "" : "es"}` }];
  }
  return [];
}

export function prefillFromRequest(r: EvalRequest): Record<string, string> {
  return {
    athleteName: r.athlete_name, sport: r.sport, position: r.position, gradYear: String(r.grad_year), filmUrl: r.film_url,
    athleteIsMinor: r.athlete_is_minor ? "yes" : "no", purchaserName: r.purchaser_name, purchaserEmail: r.purchaser_email, purchaserPhone: r.purchaser_phone ?? "",
  };
}
