import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmitForm } from "@/components/auto-submit";
import { CoachCard } from "@/components/ui";
import { DIVISIONS, SPORTS, STATES } from "@/lib/constants";
import { annotate, getDeps } from "@/lib/server";
import { resolveAgainLink } from "@/lib/services/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Find a college coach for a video evaluation",
  description: "Search verified evaluators across NCAA D1, D2, D3, NAIA, NJCAA and CCCAA by sport, division, conference and state.",
  alternates: { canonical: "/coaches" },
};

const PAGE = 24;
type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 100) || undefined;

export default async function CoachesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = one(sp.q);
  const sport = one(sp.sport);
  const division = one(sp.division);
  const conference = one(sp.conference);
  const state = one(sp.state);
  const availableOnly = one(sp.available) === "1";
  const page = Math.max(1, Number(one(sp.page) ?? 1) || 1);
  const from = one(sp.from)?.slice(0, 200); // second-opinion token, carried through to the request form

  const deps = await getDeps();
  const settings = await deps.store.getSettings();
  const [facets, result] = await Promise.all([
    deps.store.coachFacets(),
    deps.store.searchCoaches({
      q, sport, division, conference, state, availableOnly, limit: PAGE, offset: (page - 1) * PAGE,
      includeDirectory: settings.show_directory_listings,
    }),
  ]);
  const cardQuery = from ? `?from=${encodeURIComponent(from)}` : "";
  // Second opinion: never suggest the coach who already evaluated this athlete.
  const original = from ? await resolveAgainLink(deps, from) : null;
  const items = annotate(result.coaches.filter((c) => c.id !== original?.coach_id), settings);
  const sports = [...new Set([...SPORTS, ...facets.sports])].sort();
  const pages = Math.max(1, Math.ceil(result.total / PAGE));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, sport, division, conference, state, available: availableOnly ? "1" : undefined, from })) if (v) u.set(k, v);
    u.set("page", String(p));
    return `/coaches?${u}`;
  };
  const anyFilter = q || sport || division || conference || state || availableOnly;

  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Find a coach</h1>
      <p className="mt-2 text-muted">
        {original ? `Pick a second coach for ${original.athlete_name.split(" ")[0]} — details will be filled in for you.` :
          "Request any coach. If they haven't joined yet, we email them your request — you're only charged if they deliver."}
      </p>

      <AutoSubmitForm action="/coaches" className="card mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="q" className="sr-only">Search</label>
          <input id="q" name="q" defaultValue={q} placeholder="Search name, college, conference…" className="field" type="search" enterKeyHint="search" />
        </div>
        <Select name="sport" label="Sport" value={sport} options={sports} />
        <Select name="division" label="Division" value={division} options={[...DIVISIONS]} />
        <Select name="conference" label="Conference" value={conference} options={facets.conferences} />
        <Select name="state" label="State" value={state} options={Object.keys(STATES)} labels={STATES} />
        {from && <input type="hidden" name="from" value={from} />}
        <div className="flex items-center justify-between gap-3 sm:col-span-2 lg:col-span-5">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="available" value="1" defaultChecked={availableOnly} className="h-4 w-4 accent-blue" />
            On The Athlete Market only
          </label>
          <div className="flex gap-2">
            {anyFilter && <Link href="/coaches" className="btn-ghost btn-sm">Clear</Link>}
            <button className="btn-primary btn-sm">Search</button>
          </div>
        </div>
      </AutoSubmitForm>

      <p className="mt-6 text-sm text-muted" aria-live="polite">
        {items.length < result.coaches.length ? result.total - 1 : result.total} {result.total === 1 ? "coach" : "coaches"}
      </p>

      {items.length ? (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ coach, availability }) => <CoachCard key={coach.id} coach={coach} availability={availability} tiers={settings.price_tiers_cents} query={cardQuery} />)}
        </div>
      ) : (
        <div className="card mt-3 p-10 text-center">
          <p className="font-semibold">No coaches match those filters.</p>
          <p className="mt-1 text-sm text-muted">
            Try a broader search, or{" "}
            <Link href={`/coaches?available=1${from ? `&from=${encodeURIComponent(from)}` : ""}`} className="font-semibold text-blue">see every coach available now</Link>.
          </p>
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
          {page > 1 && <Link className="btn-ghost btn-sm" href={qs(page - 1)}>← Previous</Link>}
          <span className="px-3 text-sm text-muted">Page {page} of {pages}</span>
          {page < pages && <Link className="btn-ghost btn-sm" href={qs(page + 1)}>Next →</Link>}
        </nav>
      )}

      <div className="card mt-8 flex flex-col items-center gap-3 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <p className="font-semibold">Can&apos;t find your coach?</p>
          <p className="text-sm text-muted">Add any coach by name and email — we&apos;ll send them your request.</p>
        </div>
        <Link href={`/coaches/add${from ? `?from=${encodeURIComponent(from)}` : ""}`} className="btn-navy shrink-0">Request a coach not listed</Link>
      </div>

      {<p className="mx-auto mt-12 max-w-2xl text-center text-xs leading-relaxed text-subtle">
        Coach listings come from public information or from coaches who joined. A listing does not mean the coach, school or team is affiliated with or endorses The Athlete Market. Coaches can ask us to remove their listing at any time.
      </p>}
    </div>
  );
}

function Select({ name, label, value, options, labels }: { name: string; label: string; value?: string; options: string[]; labels?: Record<string, string> }) {
  return (
    <div>
      <label htmlFor={name} className="sr-only">{label}</label>
      <select id={name} name={name} defaultValue={value ?? ""} className="field">
        <option value="">{`Any ${label.toLowerCase()}`}</option>
        {options.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
      </select>
    </div>
  );
}
