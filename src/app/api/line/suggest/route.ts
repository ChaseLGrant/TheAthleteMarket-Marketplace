import { NextResponse } from "next/server";
import { getDeps } from "@/lib/deps";
import { schoolLineAddress } from "@/lib/services/line";

/** Ask-box typeahead: schools (with staff count) and individual coaches. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 60);
  if (q.trim().length < 2) return NextResponse.json({ schools: [], coaches: [] });
  const deps = await getDeps();
  const [schools, coaches] = await Promise.all([
    deps.store.suggestSchools(q, 6),
    deps.store.searchCoaches({ q, limit: 4 }),
  ]);
  return NextResponse.json(
    {
      schools: schools.map((s) => ({ ...s, address: schoolLineAddress(s.school, s.sport) })),
      coaches: coaches.coaches.filter((c) => c.email && !c.removed).map((c) => ({ slug: c.slug, name: c.full_name, title: c.title, school: c.school, sport: c.sport })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
