import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RequestForm } from "@/components/request-form";
import { Avatar, Notice, VerifiedBadge } from "@/components/ui";
import { paidRequestGate } from "@/lib/compliance";
import { money } from "@/lib/format";
import { getDeps, isBot } from "@/lib/server";
import { resolveAgainLink } from "@/lib/services/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request an evaluation", robots: { index: false } };

type P = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function RequestPage({ params, searchParams }: P) {
  const { slug } = await params;
  const sp = await searchParams;
  const deps = await getDeps();
  const coach = await deps.store.getCoachBySlug(slug);
  if (!coach) notFound();
  const settings = await deps.store.getSettings();
  const gate = paidRequestGate(coach, settings);
  if (!(await isBot())) deps.store.track("form_view", coach.id).catch(() => {});
  // Second opinion: pre-fill from the original (signed) request.
  const original = sp.from ? await resolveAgainLink(deps, sp.from) : null;
  const prefill = original
    ? {
        athleteName: original.athlete_name, sport: original.sport, position: original.position, gradYear: String(original.grad_year),
        filmUrl: original.film_url, athleteIsMinor: original.athlete_is_minor ? "yes" : "no", relationship: original.purchaser_relationship,
        purchaserName: original.purchaser_name, purchaserEmail: original.purchaser_email, athleteEmail: original.athlete_email ?? "",
        metrics: original.metrics ?? "", gpa: original.gpa ?? "",
      }
    : undefined;

  if (!gate.ok) {
    return (
      <div className="container-page max-w-xl py-16 text-center">
        <h1 className="text-2xl font-bold">{coach.full_name} isn&apos;t accepting requests</h1>
        <p className="mt-2 text-muted">Paid evaluations are only available from verified, approved evaluators.</p>
        <Link href="/coaches?available=1" className="btn-primary mt-6">See available coaches</Link>
      </div>
    );
  }

  return (
    <div className="container-page max-w-5xl py-8 sm:py-12">
      <Link href={`/coaches/${coach.slug}`} className="text-sm font-medium text-muted hover:text-navy">← {coach.full_name}</Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Request your evaluation</h1>
      <p className="mt-1 text-muted">Takes about a minute. No account needed.</p>
      {original && <div className="mt-4"><Notice tone="success" title="Second opinion">{original.athlete_name}&apos;s details are already filled in — just check and continue.</Notice></div>}
      {sp.cancelled && <div className="mt-4"><Notice tone="warn">Checkout was cancelled — you haven&apos;t been charged. Your details are below whenever you&apos;re ready.</Notice></div>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="card p-5 sm:p-8">
          <RequestForm
            coachSlug={coach.slug}
            coachFirstName={coach.full_name.split(" ")[0]!}
            sport={coach.sport}
            priceLabel={money(coach.price_cents)}
            deadlineDays={settings.deadline_days}
            utmSource={sp.utm_source}
            utmCampaign={sp.utm_campaign}
            fromToken={original ? sp.from : undefined}
            prefill={prefill}
          />
        </div>
        <aside className="order-first lg:order-none lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <Avatar coach={coach} size={48} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{coach.full_name}</p>
                <p className="truncate text-sm text-muted">{[coach.title, coach.school].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
            <div className="mt-3"><VerifiedBadge /></div>
            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted">30–60s video evaluation</dt><dd className="font-semibold">{money(coach.price_cents)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Delivery</dt><dd className="font-semibold">Within {settings.deadline_days} days</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base"><dt className="font-semibold">Total</dt><dd className="font-bold">{money(coach.price_cents)}</dd></div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
