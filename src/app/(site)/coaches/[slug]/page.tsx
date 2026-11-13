import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, InviteBadge, JoinedBadge, Notice, PriceLabel, Stars } from "@/components/ui";
import { availabilityLabel, familyChoosesOffer } from "@/lib/compliance";
import { getDeps, isBot } from "@/lib/server";
import { deliveryBadge } from "@/lib/services/coach-stats";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }>; searchParams?: Promise<{ from?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const coach = await (await getDeps()).store.getCoachBySlug(slug);
  if (!coach || coach.removed) return { title: "Coach not found" };
  const where = [coach.title, coach.school].filter(Boolean).join(", ");
  return {
    title: `${coach.full_name} — ${coach.sport} video evaluation`,
    description: `Request a personal 30–60 second film evaluation from ${coach.full_name}${where ? `, ${where}` : ""}.`,
    alternates: { canonical: `/coaches/${coach.slug}` },
    // Only index coaches who joined; never index family-added (unlisted) coaches.
    robots: coach.listing_type === "participating" && !coach.unlisted ? undefined : { index: false },
  };
}

export default async function CoachPage({ params, searchParams }: P) {
  const { slug } = await params;
  const from = (await searchParams)?.from?.slice(0, 200);
  const deps = await getDeps();
  const coach = await deps.store.getCoachBySlug(slug);
  if (!coach || coach.removed || (coach.source === "self" && !coach.email_confirmed_at)) notFound();
  const settings = await deps.store.getSettings();
  const introSrc = coach.intro_video_path ? await deps.storage.playbackUrl(coach.intro_video_path, 6 * 3600).catch(() => null) : null;
  const speed = deliveryBadge(coach);
  const status = availabilityLabel(coach, settings);
  const first = coach.full_name.split(" ")[0];
  const respondRate = coach.requests_received >= 3 ? Math.round((coach.delivered_count / coach.requests_received) * 100) : null;
  if (!(await isBot())) deps.store.track("coach_view", coach.id).catch(() => {});

  return (
    <div className="container-page max-w-4xl py-8 sm:py-12">
      <Link href="/coaches" className="text-sm font-medium text-muted hover:text-navy">← All coaches</Link>
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px]">
        <section className="card p-6 sm:p-8">
          <div className="flex items-center gap-4">
            <Avatar coach={coach} size={80} />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{coach.full_name}</h1>
              <p className="text-muted">{[coach.title, coach.school].filter(Boolean).join(" · ")}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {status === "joined" ? <JoinedBadge /> : status === "invite" ? <InviteBadge /> : null}
                <Stars coach={coach} />
              </div>
              {speed && <p className="mt-1.5 text-sm font-medium text-success">⚡ {speed}</p>}
              {respondRate != null && <p className="mt-1 text-sm text-muted">Delivered {respondRate}% of requests</p>}
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Sport", coach.sport], ["Level", coach.division], ["Conference", coach.conference], ["State", coach.state]].map(([k, v]) => (
              <div key={k} className="min-w-0 rounded-xl bg-surface p-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 truncate text-sm font-semibold">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {introSrc && (
            <div className="mt-6">
              <p className="mb-2 text-sm font-semibold text-navy">Meet {first}</p>
              <video src={introSrc} controls playsInline preload="metadata" className="aspect-video w-full rounded-xl bg-black" />
            </div>
          )}
          {coach.credentials && <p className="mt-6 text-sm font-semibold text-navy">{coach.credentials}</p>}
          {coach.bio && <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-muted">{coach.bio}</p>}
          {status === "invite" && (
            <div className="mt-6">
              <Notice tone="info" title={`${first} hasn't joined The Athlete Market yet`}>
                That&apos;s okay — we&apos;ll email {first} your request and your offer, and they choose whether to take it. If they don&apos;t
                deliver within {settings.deadline_days} days, your card is never charged. This listing doesn&apos;t mean the coach or their school is
                affiliated with or endorses The Athlete Market.
              </Notice>
            </div>
          )}
        </section>

        <aside className="md:sticky md:top-24 md:self-start">
          {status !== "unavailable" ? (
            <div className="card p-6">
              <p className="text-sm text-muted">Personal video evaluation</p>
              <p className="mt-1 text-3xl font-bold tracking-tight"><PriceLabel coach={coach} tiers={settings.price_tiers_cents} /></p>
              {familyChoosesOffer(coach, settings) && <p className="mt-1 text-xs text-muted">You choose your offer. {first} sees it before deciding.</p>}
              <ul className="mt-4 space-y-2 text-sm text-navy">
                <li>🎥 30–60 second personal video</li>
                <li>⏱ Within {settings.deadline_days} days</li>
                <li>💳 Card charged only when delivered</li>
                <li>🔒 Private link — no account needed</li>
              </ul>
              <Link href={`/coaches/${coach.slug}/request${from ? `?from=${encodeURIComponent(from)}` : ""}`} className="btn-primary mt-5 w-full">
                Request {first}
              </Link>
              <p className="mt-3 text-center text-xs text-subtle">Feedback only — not a recruiting offer.</p>
            </div>
          ) : (
            <div className="card p-6">
              <p className="font-semibold">{coach.paused ? `${first} is taking a short break` : `${first} isn't taking requests`}</p>
              <p className="mt-1 text-sm text-muted">Choose another coach — or request anyone by email.</p>
              <Link href={`/coaches?sport=${encodeURIComponent(coach.sport)}`} className="btn-primary mt-4 w-full">See {coach.sport} coaches</Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
