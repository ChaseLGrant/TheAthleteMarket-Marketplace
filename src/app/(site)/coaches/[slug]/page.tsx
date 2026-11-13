import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, DirectoryBadge, Notice, VerifiedBadge } from "@/components/ui";
import { WaitlistForm } from "@/components/waitlist-form";
import { availabilityLabel } from "@/lib/compliance";
import { money } from "@/lib/format";
import { getDeps, isBot } from "@/lib/server";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const coach = await (await getDeps()).store.getCoachBySlug(slug);
  if (!coach) return { title: "Coach not found" };
  const where = [coach.title, coach.school].filter(Boolean).join(", ");
  return {
    title: `${coach.full_name} — ${coach.sport} video evaluation`,
    description: coach.listing_type === "participating"
      ? `Get a personal 30–60 second film evaluation from ${coach.full_name}${where ? `, ${where}` : ""}.`
      : `${coach.full_name}${where ? `, ${where}` : ""}. Directory listing — not available for booking on The Athlete Market.`,
    alternates: { canonical: `/coaches/${coach.slug}` },
    robots: coach.listing_type === "directory" ? { index: false } : undefined,
  };
}

export default async function CoachPage({ params }: P) {
  const { slug } = await params;
  const deps = await getDeps();
  const coach = await deps.store.getCoachBySlug(slug);
  if (!coach || (coach.listing_type === "participating" && coach.verification_status !== "verified")) notFound();
  const settings = await deps.store.getSettings();
  const status = availabilityLabel(coach, settings);
  if (!(await isBot())) deps.store.track("coach_view", coach.id).catch(() => {});

  return (
    <div className="container-page max-w-4xl py-8 sm:py-12">
      <Link href="/coaches" className="text-sm font-medium text-muted hover:text-navy">← All coaches</Link>
      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_320px]">
        <section className="card p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <Avatar coach={coach} size={80} />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{coach.full_name}</h1>
              <p className="text-muted">{[coach.title, coach.school].filter(Boolean).join(" · ")}</p>
              <div className="mt-2">{status === "directory" ? <DirectoryBadge /> : <VerifiedBadge />}</div>
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Sport", coach.sport], ["Division", coach.division], ["Conference", coach.conference], ["State", coach.state]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-surface p-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 truncate text-sm font-semibold">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {coach.credentials && <p className="mt-6 text-sm font-semibold text-navy">{coach.credentials}</p>}
          {coach.bio && <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-muted">{coach.bio}</p>}
          {status === "directory" && (
            <div className="mt-6">
              <Notice tone="info" title="This coach is not on The Athlete Market">
                This listing comes from publicly available information. {coach.full_name} has not joined, is not affiliated with us, and cannot be
                booked here. Active college coaches are often restricted from accepting payment for evaluating prospects.
              </Notice>
            </div>
          )}
        </section>

        <aside className="md:sticky md:top-24 md:self-start">
          {status === "available" ? (
            <div className="card p-6">
              <p className="text-sm text-muted">Personal video evaluation</p>
              <p className="mt-1 text-4xl font-bold tracking-tight">{money(coach.price_cents)}</p>
              <ul className="mt-4 space-y-2 text-sm text-navy">
                <li>🎥 30–60 second personal video</li>
                <li>⏱ Delivered within {settings.deadline_days} days</li>
                <li>💳 Card charged only when delivered</li>
                <li>🔒 Private link — no account needed</li>
              </ul>
              <Link href={`/coaches/${coach.slug}/request`} className="btn-primary mt-5 w-full">Request evaluation</Link>
              <p className="mt-3 text-center text-xs text-subtle">Feedback only — not a recruiting offer.</p>
            </div>
          ) : status === "directory" ? (
            <div className="card p-6">
              <p className="font-semibold">Want feedback from {coach.full_name.split(" ")[0]}?</p>
              <p className="mt-1 text-sm text-muted">We&apos;ll email you if they ever join as an approved evaluator.</p>
              <div className="mt-4"><WaitlistForm coachId={coach.id} name={coach.full_name} /></div>
              <Link href={`/coaches?available=1&sport=${encodeURIComponent(coach.sport)}`} className="btn-ghost mt-4 w-full">Available {coach.sport} coaches</Link>
            </div>
          ) : (
            <div className="card p-6">
              <p className="font-semibold">Not taking requests right now</p>
              <p className="mt-1 text-sm text-muted">Check back soon, or choose another evaluator.</p>
              <Link href={`/coaches?available=1&sport=${encodeURIComponent(coach.sport)}`} className="btn-primary mt-4 w-full">See available coaches</Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
