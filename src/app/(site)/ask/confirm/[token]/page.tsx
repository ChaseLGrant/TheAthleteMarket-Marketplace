import type { Metadata } from "next";
import Link from "next/link";
import type { Target } from "@/components/ask-box";
import { AskForm } from "@/components/ask-form";
import { Notice } from "@/components/ui";
import { paymentsOff } from "@/lib/env";
import { getDeps } from "@/lib/server";
import { askPrices, resolveDraftToken } from "@/lib/services/line";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm your message — Coach Line", robots: { index: false } };

/** First-time Gmail sender: their email is already drafted — they add athlete details + card once. */
export default async function ConfirmDraft({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const deps = await getDeps();
  const draft = await resolveDraftToken(deps, token);
  if (!draft) {
    return (
      <div className="container-page max-w-xl py-16 text-center">
        <h1 className="text-2xl font-bold">This message was already sent or has expired</h1>
        <p className="mt-2 text-muted">You can always start a new one.</p>
        <Link href="/ask" className="btn-primary mt-6">Message a college</Link>
      </div>
    );
  }
  const settings = await deps.store.getSettings();
  const coach = draft.coach_id ? await deps.store.getCoach(draft.coach_id) : null;
  const targets: Target[] = coach
    ? [{ coachSlug: coach.slug, school: coach.school ?? undefined, sport: coach.sport, label: coach.full_name, sub: [coach.title, coach.school].filter(Boolean).join(" · ") }]
    : draft.target_school ? [{ school: draft.target_school, sport: draft.target_sport ?? undefined, label: draft.target_school, sub: `${draft.target_sport ?? ""} staff` }] : [];
  return (
    <div className="container-page max-w-3xl py-8 sm:py-12">
      <p className="text-sm font-bold uppercase tracking-wider text-blue">Coach Line</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">We got your email — one step to send it</h1>
      <div className="mt-4"><Notice tone="success" title="Your message is filled in">Add the athlete&apos;s details once. Next time, just email us and reply YES.</Notice></div>
      <div className="card mt-8 min-w-0 p-5 sm:p-8">
        <AskForm prices={askPrices(settings)} free={paymentsOff()} escalateHours={settings.escalate_after_hours} deadlineDays={settings.deadline_days}
          initialTargets={targets} draftToken={token}
          prefill={{ message: draft.message, filmUrl: draft.film_url ?? "", purchaserEmail: draft.from_email, sport: draft.target_sport ?? coach?.sport ?? "" }} />
      </div>
    </div>
  );
}
